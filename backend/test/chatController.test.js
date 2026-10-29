const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createChatController } = require('../controllers/chatController');
const { ChatError } = require('../services/chatErrors');

function fixture({ generate, speech, configure } = {}) {
  let clock = 100;
  const events = [];
  const calls = [];
  const service = {
    model: 'gpt-6-luna',
    validateConfiguration: () => { calls.push('configuration'); configure?.(); },
    generateResponse: async (text, options) => {
      calls.push(['ai', text, options]); clock += 12;
      return generate ? generate(text, options) : 'Hello!';
    },
    synthesizeSpeech: async (text, options) => {
      calls.push(['speech', text, options]); clock += 34;
      return speech ? speech(text, options) : { audioFilename: 'echo_fixture.mp3', visemes: [{ visemeId: 4, timeMs: 0, duration: 100 }] };
    }
  };
  const handle = createChatController({ service, now: () => clock, requestId: () => 'request-fixture', logger: { info: event => events.push(JSON.parse(event)) } });
  const req = Object.assign(new EventEmitter(), { body: { message: '  Private prompt  ' } });
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200, writableEnded: false, headersSent: false,
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.header = [name, value]; return this; },
    json(value) { this.body = value; this.headersSent = true; this.writableEnded = true; return this; }
  });
  return { handle, req, res, calls, events };
}

const tick = () => new Promise(resolve => setImmediate(resolve));

test('sends the existing success contract only after full speech is available', async () => {
  let finishSpeech;
  const f = fixture({ speech: () => new Promise(resolve => { finishSpeech = resolve; }) });
  const running = f.handle(f.req, f.res);
  await tick();
  assert.equal(f.res.body, undefined);
  assert.deepEqual(f.calls.map(call => Array.isArray(call) ? call.slice(0, 2) : call), ['configuration', ['ai', 'Private prompt'], ['speech', 'Hello!']]);
  finishSpeech({ audioFilename: 'echo_fixture.mp3', visemes: [{ visemeId: 4, timeMs: 0, duration: 100 }] });
  await running;
  assert.deepEqual(f.res.body, { success: true, text: 'Hello!', audioUrl: '/audio/echo_fixture.mp3', visemes: [{ visemeId: 4, timeMs: 0, duration: 100 }] });
  assert.deepEqual(f.events, [{
    event: 'chat.request', requestId: 'request-fixture', model: 'gpt-6-luna', outcome: 'success', code: 'OK',
    upstreamStatus: null, upstreamCode: null, aiMs: 12, speechMs: 34, totalMs: 46
  }]);
  assert.equal(f.req.listenerCount('aborted'), 0);
  assert.equal(f.res.listenerCount('close'), 0);
});

test('rejects whitespace before configuration or provider work', async () => {
  const f = fixture();
  f.req.body.message = ' \n\t ';
  await f.handle(f.req, f.res);
  assert.equal(f.res.statusCode, 400);
  assert.deepEqual(f.res.body, { success: false, error: 'Invalid request', message: 'Please enter a message and try again.', code: 'INVALID_REQUEST', requestId: 'request-fixture' });
  assert.deepEqual(f.calls, []);
});

test('a null JSON body is INVALID_REQUEST rather than an internal error', async () => {
  const f = fixture();
  f.req.body = null;
  await f.handle(f.req, f.res);
  assert.equal(f.res.body.code, 'INVALID_REQUEST');
});

test('preflights missing configuration before inference', async () => {
  const f = fixture({ configure: () => { throw new ChatError('CONFIGURATION_ERROR'); } });
  await f.handle(f.req, f.res);
  assert.equal(f.res.statusCode, 503);
  assert.equal(f.res.body.code, 'CONFIGURATION_ERROR');
  assert.deepEqual(f.calls, ['configuration']);
});

test('logs only safe classification and timings for upstream failure', async () => {
  const f = fixture({ generate: async () => { throw new ChatError('MODEL_UNAVAILABLE', { status: 404, code: 'model_not_found', message: 'SECRET TOKEN' }); } });
  await f.handle(f.req, f.res);
  assert.equal(f.res.statusCode, 503);
  assert.equal(f.res.body.code, 'MODEL_UNAVAILABLE');
  assert.equal(f.res.body.requestId, 'request-fixture');
  assert.equal(f.events[0].upstreamStatus, 404);
  assert.equal(f.events[0].upstreamCode, 'model_not_found');
  assert.equal(f.events[0].aiMs, 12);
  assert.equal(f.events[0].speechMs, 0);
  assert.equal(JSON.stringify({ body: f.res.body, events: f.events }).includes('SECRET'), false);
  assert.equal(JSON.stringify(f.events).includes('Private prompt'), false);
  assert.equal(f.calls.length, 2);
});

test('raw unexpected errors and unknown provider codes are not exposed', async () => {
  const f = fixture({ generate: async () => { throw Object.assign(new Error('SECRET prompt and token'), { code: 'SECRET_TOKEN', status: 500 }); } });
  await f.handle(f.req, f.res);
  assert.equal(f.res.statusCode, 500);
  assert.equal(f.res.body.code, 'INTERNAL_ERROR');
  assert.equal(f.events[0].upstreamCode, null);
  assert.equal(JSON.stringify({ body: f.res.body, events: f.events }).includes('SECRET'), false);
});

test('speech failure ends the request with a stable error and no text result', async () => {
  const f = fixture({ speech: async () => { throw new ChatError('SPEECH_UNAVAILABLE'); } });
  await f.handle(f.req, f.res);
  assert.equal(f.res.statusCode, 502);
  assert.equal(f.res.body.code, 'SPEECH_UNAVAILABLE');
  assert.equal(f.res.body.text, undefined);
  assert.equal(f.events[0].aiMs, 12);
  assert.equal(f.events[0].speechMs, 34);
});

for (const disconnectEvent of ['aborted', 'close']) {
  test(`${disconnectEvent} disconnect aborts providers, avoids response writes, and removes listeners`, async () => {
    let signal;
    const f = fixture({ generate: (text, options) => new Promise((resolve, reject) => {
      signal = options.signal;
      signal.addEventListener('abort', () => reject(Object.assign(new Error('closed'), { name: 'AbortError' })), { once: true });
    }) });
    const running = f.handle(f.req, f.res);
    await tick();
    (disconnectEvent === 'aborted' ? f.req : f.res).emit(disconnectEvent);
    await running;
    assert.equal(signal.aborted, true);
    assert.equal(f.res.body, undefined);
    assert.equal(f.events[0].outcome, 'disconnected');
    assert.equal(f.req.listenerCount('aborted'), 0);
    assert.equal(f.res.listenerCount('close'), 0);
    assert.equal(f.calls.length, 2);
  });
}

test('normal request close does not cancel an in-progress response', async () => {
  let finishSpeech;
  const f = fixture({ speech: () => new Promise(resolve => { finishSpeech = resolve; }) });
  const running = f.handle(f.req, f.res);
  await tick();
  f.req.emit('close');
  assert.equal(f.calls[1][2].signal.aborted, false);
  finishSpeech({ audioFilename: 'echo.mp3', visemes: [] });
  await running;
  assert.equal(f.res.body.success, true);
});

test('logs a safe numeric Azure cancellation code without provider details', async () => {
  const f = fixture({ speech: async () => { throw new ChatError('SPEECH_UNAVAILABLE', { code: 6, message: 'SECRET Azure details' }); } });
  await f.handle(f.req, f.res);
  assert.equal(f.events[0].upstreamCode, 6);
  assert.equal(f.events[0].upstreamStatus, null);
  assert.equal(f.events[0].code, 'SPEECH_UNAVAILABLE');
  assert.equal(JSON.stringify(f.events).includes('SECRET'), false);
});
