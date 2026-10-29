const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

// Observe startup without binding the legacy app to its production port.
const originalListen = express.application.listen;
let startupListens = 0;
express.application.listen = function () { startupListens++; };
const appModule = require('../app');
express.application.listen = originalListen;

function testApp() {
  const events = [];
  const calls = [];
  const app = appModule.createApp({
    env: { OPENAI_MODEL: 'offline-model' },
    logger: { info: value => events.push(JSON.parse(value)) },
    chatService: {
      model: 'offline-model',
      validateConfiguration() { calls.push('configuration'); },
      async generateResponse(message) { calls.push(['ai', message]); return 'Hello!'; },
      async synthesizeSpeech(text) { calls.push(['speech', text]); return { audioFilename: 'fixture.mp3', visemes: [] }; }
    }
  });
  return { app, events, calls };
}

async function serve(app, run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  }
}

test('exports a testable Express app without starting a listener when imported', () => {
  assert.equal(startupListens, 0);
  assert.equal(typeof appModule, 'function');
  assert.equal(typeof appModule.createApp, 'function');
});

test('health endpoints report liveness without invoking or claiming provider readiness', async () => {
  const f = testApp();
  await serve(f.app, async base => {
    for (const path of ['/health', '/api/chat/health']) {
      const response = await fetch(`${base}${path}`);
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.status, 'healthy');
      assert.equal(body.check, 'liveness');
      assert.equal(body.model, 'offline-model');
      assert.equal(body.features, undefined);
    }
  });
  assert.deepEqual(f.calls, []);
});

test('the HTTP route preserves the success shape and trimmed input', async () => {
  const f = testApp();
  await serve(f.app, async base => {
    const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: '  Hi  ' }) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { text: 'Hello!', audioUrl: '/audio/fixture.mp3', visemes: [], success: true });
    assert.match(response.headers.get('x-request-id'), /^[a-f0-9-]{36}$/);
  });
  assert.deepEqual(f.calls, ['configuration', ['ai', 'Hi'], ['speech', 'Hello!']]);
  assert.equal(f.events.length, 1);
});

test('malformed JSON is an INVALID_REQUEST with a safe generated request ID', async () => {
  const f = testApp();
  await serve(f.app, async base => {
    const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'untrusted-secret' }, body: '{"private prompt":' });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.code, 'INVALID_REQUEST');
    assert.equal(body.success, false);
    assert.match(body.requestId, /^[a-f0-9-]{36}$/);
    assert.equal(response.headers.get('x-request-id'), body.requestId);
    assert.equal(JSON.stringify(body).includes('private prompt'), false);
    assert.equal(JSON.stringify(body).includes('untrusted-secret'), false);
  });
  assert.deepEqual(f.calls, []);
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].code, 'INVALID_REQUEST');
});

test('an unsupported JSON charset is an INVALID_REQUEST', async () => {
  const f = testApp();
  await serve(f.app, async base => {
    const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=iso-8859-1' }, body: '{}' });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'INVALID_REQUEST');
  });
  assert.deepEqual(f.calls, []);
});

test('an error after headers is logged safely without forwarding a raw error to Express', async () => {
  const events = [];
  const app = appModule.createApp({
    logger: { info: event => events.push(JSON.parse(event)) },
    chatHandler: (req, res, next) => { res.write('partial'); next(new Error('FAKE_PRIVATE_ERROR')); }
  });
  await serve(app, async base => {
    await assert.rejects(async () => {
      const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      await response.text();
    });
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].code, 'INTERNAL_ERROR');
  assert.equal(JSON.stringify(events).includes('FAKE_PRIVATE_ERROR'), false);
});
