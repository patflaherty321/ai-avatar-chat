const test = require('node:test');
const assert = require('node:assert/strict');
const { createChatService } = require('../services/chatService');
const OpenAI = require('openai');
const azureSdk = require('microsoft-cognitiveservices-speech-sdk');

const validEnv = {
  OPENAI_API_KEY: 'test-openai-key',
  AZURE_SPEECH_KEY: 'test-speech-key',
  AZURE_SPEECH_REGION: 'test-region'
};

function fixture({ env = {}, create, fileWrite } = {}) {
  const calls = [];
  const options = [];
  const timers = new Map();
  let timerId = 0;
  const speech = { closed: 0, requests: 0, files: [], removed: [] };
  class OpenAIClient {
    constructor(config) {
      options.push(config);
      this.chat = { completions: { create: (payload, requestOptions) => {
        calls.push({ payload, requestOptions });
        return create ? create(payload, requestOptions) : Promise.resolve({ choices: [{ message: { content: '  Hello there!  ' } }] });
      } } };
    }
  }
  const speechSdk = {
    CancellationDetails: azureSdk.CancellationDetails,
    CancellationErrorCode: azureSdk.CancellationErrorCode,
    SpeechConfig: { fromSubscription: (key, region) => { speech.config = { key, region }; return speech.config; } },
    SpeechSynthesisOutputFormat: { Audio24Khz160KBitRateMonoMp3: 'mp3' },
    ResultReason: { SynthesizingAudioCompleted: 'completed' },
    SpeechSynthesizer: class {
      constructor(config) { speech.synthesizer = this; }
      speakSsmlAsync(ssml, success, error) {
        speech.requests++;
        Object.assign(speech, { ssml, success, error, viseme: this.visemeReceived });
      }
      close() { speech.closed++; }
    }
  };
  const service = createChatService({
    env: { ...validEnv, ...env }, OpenAIClient, speechSdk,
    fileSystem: {
      writeFile: async (file, data) => { speech.files.push({ file, data }); if (fileWrite) await fileWrite(); },
      remove: async file => { speech.removed.push(file); }
    },
    timers: {
      setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
      clearTimeout: id => timers.delete(id)
    }
  });
  const expire = () => { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.fn(); };
  return { service, calls, options, speech, timers, expire };
}

const tick = () => new Promise(resolve => setImmediate(resolve));
const success = { reason: 'completed', audioData: new Uint8Array([1, 2, 3]).buffer };

function rejectsCode(promise, code, status) {
  return assert.rejects(promise, error => {
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });
}

test('uses the bounded gpt-6-luna payload, separate Echo persona, and one SDK request', async () => {
  const f = fixture();
  assert.equal(await f.service.generateResponse('  Say hello  '), 'Hello there!');
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].payload, {
    model: 'gpt-6-luna',
    messages: [
      { role: 'system', content: 'You are Echo, a friendly and helpful AI assistant with a playful personality. Be concise and warm. Keep every response under 100 words.' },
      { role: 'user', content: 'Say hello' }
    ],
    reasoning_effort: 'none', max_completion_tokens: 256, temperature: 0.7
  });
  assert.equal(f.options[0].maxRetries, 0);
  assert.equal(f.options[0].timeout, 25000);
  assert.equal(f.calls[0].requestOptions.maxRetries, 0);
  assert.equal(f.calls[0].requestOptions.timeout, 25000);
  assert.equal(f.calls[0].requestOptions.signal.aborted, false);
  assert.equal(f.timers.size, 0);
});

test('uses a trimmed OPENAI_MODEL override', async () => {
  const f = fixture({ env: { OPENAI_MODEL: '  custom-model  ' } });
  await f.service.generateResponse('Hello');
  assert.equal(f.calls[0].payload.model, 'custom-model');
});

function capturedTransport() {
  const requests = [];
  class OpenAIClient extends OpenAI {
    constructor(config) {
      super({ ...config, fetch: async (url, options) => {
        requests.push({ url: String(url), body: JSON.parse(options.body), authorization: options.headers.authorization });
        return new Response(JSON.stringify({
          id: 'chatcmpl-test', object: 'chat.completion', created: 1, model: 'gpt-6-luna',
          choices: [{ index: 0, message: { role: 'assistant', content: 'Hello from the configured endpoint.' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      } });
    }
  }
  return { OpenAIClient, requests };
}

test('sends chat to the injected Azure v1 endpoint using its deployment name', async () => {
  const transport = capturedTransport();
  const service = createChatService({
    env: { ...validEnv, OPENAI_BASE_URL: '  https://example.openai.azure.com/openai/v1/  ', OPENAI_MODEL: '  echo-chat  ' },
    OpenAIClient: transport.OpenAIClient
  });
  assert.equal(await service.generateResponse('Hello'), 'Hello from the configured endpoint.');
  assert.equal(transport.requests.length, 1);
  assert.equal(transport.requests[0].url, 'https://example.openai.azure.com/openai/v1/chat/completions');
  assert.equal(transport.requests[0].body.model, 'echo-chat');
  assert.equal(transport.requests[0].authorization, 'Bearer test-openai-key');
});

for (const endpoint of [undefined, '', ' \t ']) {
  test(`keeps the OpenAI endpoint despite ambient configuration when OPENAI_BASE_URL is ${JSON.stringify(endpoint)}`, async t => {
    const previous = process.env.OPENAI_BASE_URL;
    process.env.OPENAI_BASE_URL = 'https://ambient.example/openai/v1/';
    t.after(() => {
      if (previous === undefined) delete process.env.OPENAI_BASE_URL;
      else process.env.OPENAI_BASE_URL = previous;
    });
    const transport = capturedTransport();
    const service = createChatService({
      env: { ...validEnv, OPENAI_BASE_URL: endpoint }, OpenAIClient: transport.OpenAIClient
    });
    await service.generateResponse('Hello');
    assert.equal(transport.requests.length, 1);
    assert.equal(transport.requests[0].url, 'https://api.openai.com/v1/chat/completions');
  });
}

for (const message of ['', ' \n\t ', null, undefined, 123, {}]) {
  test(`rejects invalid input ${JSON.stringify(message)} before providers`, async () => {
    const f = fixture();
    await rejectsCode(f.service.generateResponse(message), 'INVALID_REQUEST', 400);
    assert.equal(f.calls.length, 0);
  });
}

for (const content of ['', ' \n ', null, undefined]) {
  test(`rejects empty model content ${JSON.stringify(content)}`, async () => {
    const f = fixture({ create: async () => ({ choices: [{ message: { content } }] }) });
    await rejectsCode(f.service.generateResponse('Hello'), 'EMPTY_RESPONSE', 502);
    assert.equal(f.calls.length, 1);
    assert.equal(f.speech.requests, 0);
    assert.equal(f.timers.size, 0);
  });
}

for (const [env, code] of [
  [{ OPENAI_API_KEY: '' }, 'CONFIGURATION_ERROR'],
  [{ OPENAI_API_KEY: 'your_openai_api_key_here' }, 'CONFIGURATION_ERROR'],
  [{ AZURE_SPEECH_KEY: '' }, 'CONFIGURATION_ERROR'],
  [{ AZURE_SPEECH_REGION: 'your_azure_region_here' }, 'CONFIGURATION_ERROR']
]) {
  test(`validates required configuration ${Object.keys(env)[0]}`, () => {
    const f = fixture({ env });
    assert.throws(() => f.service.validateConfiguration(), { code, status: 503 });
    assert.equal(f.calls.length, 0);
  });
}

for (const [upstream, code, status] of [
  [{ status: 401, code: 'invalid_api_key' }, 'CONFIGURATION_ERROR', 503],
  [{ status: 403 }, 'CONFIGURATION_ERROR', 503],
  [{ status: 404, code: 'model_not_found' }, 'MODEL_UNAVAILABLE', 503],
  [{ status: 400, code: 'model_not_found' }, 'MODEL_UNAVAILABLE', 503],
  [{ status: 429, code: 'rate_limit_exceeded' }, 'RATE_LIMITED', 429],
  [{ status: 500 }, 'AI_UNAVAILABLE', 502],
  [{ code: 'ECONNRESET' }, 'AI_UNAVAILABLE', 502],
  [{ name: 'APIConnectionTimeoutError' }, 'AI_TIMEOUT', 504]
]) {
  test(`maps provider failure to ${code} without retrying or exposing its message`, async () => {
    const f = fixture({ create: async () => { throw Object.assign(new Error('SECRET provider prompt/token/body'), upstream); } });
    await assert.rejects(f.service.generateResponse('private prompt'), error => {
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      assert.equal(error.message.includes('SECRET'), false);
      return true;
    });
    assert.equal(f.calls.length, 1);
    assert.equal(f.timers.size, 0);
  });
}

test('AI timeout aborts the single request and ignores a late resolution', async () => {
  let complete;
  const f = fixture({ create: () => new Promise(resolve => { complete = resolve; }) });
  const result = f.service.generateResponse('Hello');
  await tick();
  assert.equal([...f.timers.values()][0].ms, 25000);
  f.expire();
  await rejectsCode(result, 'AI_TIMEOUT', 504);
  assert.equal(f.calls[0].requestOptions.signal.aborted, true);
  complete({ choices: [{ message: { content: 'late answer' } }] });
  await tick();
  assert.equal(f.calls.length, 1);
  assert.equal(f.timers.size, 0);
});

test('disconnect aborts AI and clears its timer', async () => {
  const f = fixture({ create: () => new Promise(() => {}) });
  const controller = new AbortController();
  const result = f.service.generateResponse('Hello', { signal: controller.signal });
  await tick();
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(f.calls[0].requestOptions.signal.aborted, true);
  assert.equal(f.timers.size, 0);
});

test('speech preserves Azure voice, MP3 output, escaped SSML, and real viseme shape', async () => {
  const f = fixture();
  const result = f.service.synthesizeSpeech(`It's "warm" & <bright> — okay!`);
  assert.equal(f.speech.config.speechSynthesisVoiceName, 'en-US-EchoTurboMultilingualNeural');
  assert.equal(f.speech.config.speechSynthesisOutputFormat, 'mp3');
  assert.match(f.speech.ssml, /It&apos;s &quot;warm&quot; &amp; &lt;bright&gt; — okay!/);
  assert.match(f.speech.ssml, /<mstts:viseme type="redlips_front"\/>/);
  f.speech.viseme(null, { visemeId: 21, audioOffset: 1500000 });
  f.speech.viseme(null, { visemeId: 4, audioOffset: 500000 });
  await f.speech.success(success);
  const value = await result;
  assert.match(value.audioFilename, /^echo_.*\.mp3$/);
  assert.match(value.audioPath, /backend\/audio\/echo_.*\.mp3$/);
  assert.deepEqual(value.visemes, [
    { visemeId: 0, timeMs: 0, duration: 50 },
    { visemeId: 4, timeMs: 50, duration: 100 },
    { visemeId: 21, timeMs: 150, duration: 100 },
    { visemeId: 0, timeMs: 250, duration: 100 }
  ]);
  assert.deepEqual(f.speech.files[0].data, Buffer.from([1, 2, 3]));
  assert.equal(f.speech.closed, 1);
  assert.equal(f.speech.requests, 1);
  assert.equal(f.speech.synthesizer.visemeReceived, undefined);
  assert.equal(f.timers.size, 0);
});

test('speech uses silence fallback when Azure sends no visemes', async () => {
  const f = fixture();
  const result = f.service.synthesizeSpeech('Hello');
  await f.speech.success(success);
  assert.deepEqual((await result).visemes, [{ visemeId: 0, timeMs: 0, duration: 100 }]);
});

for (const complete of [
  f => f.speech.success({ reason: 'cancelled', errorDetails: 'SECRET raw provider body' }),
  f => f.speech.error('SECRET SDK error')
]) {
  test('speech failure closes once and keeps provider details private', async () => {
    const f = fixture();
    const result = f.service.synthesizeSpeech('Hello');
    complete(f);
    await rejectsCode(result, 'SPEECH_UNAVAILABLE', 502);
    assert.equal(f.speech.closed, 1);
    assert.equal(f.timers.size, 0);
    assert.equal(f.speech.files.length, 0);
  });
}

test('speech timeout closes synthesis and ignores late callbacks', async () => {
  const f = fixture();
  const result = f.service.synthesizeSpeech('Hello');
  assert.equal([...f.timers.values()][0].ms, 25000);
  f.expire();
  await rejectsCode(result, 'SPEECH_TIMEOUT', 504);
  f.speech.viseme(null, { visemeId: 4, audioOffset: 0 });
  await f.speech.success(success);
  f.speech.error('late error');
  assert.equal(f.speech.closed, 1);
  assert.equal(f.speech.files.length, 0);
  assert.equal(f.timers.size, 0);
});

test('disconnect closes synthesis and ignores late callbacks', async () => {
  const f = fixture();
  const controller = new AbortController();
  const result = f.service.synthesizeSpeech('Hello', { signal: controller.signal });
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  await f.speech.success(success);
  assert.equal(f.speech.closed, 1);
  assert.equal(f.speech.files.length, 0);
  assert.equal(f.timers.size, 0);
});

test('disconnect during audio save removes the late file', async () => {
  let finishWrite;
  const f = fixture({ fileWrite: () => new Promise(resolve => { finishWrite = resolve; }) });
  const controller = new AbortController();
  const result = f.service.synthesizeSpeech('Hello', { signal: controller.signal });
  const callback = f.speech.success(success);
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  finishWrite();
  await callback;
  assert.equal(f.speech.removed.includes(f.speech.files[0].file), true);
  assert.equal(f.speech.closed, 1);
  assert.equal(f.timers.size, 0);
});

test('an unsolicited provider AbortError is an AI failure, not a client disconnect', async () => {
  const f = fixture({ create: async () => { throw Object.assign(new Error('provider closed'), { name: 'AbortError' }); } });
  await rejectsCode(f.service.generateResponse('Hello'), 'AI_UNAVAILABLE', 502);
});

test('already disconnected requests never start either provider', async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(f.service.generateResponse('Hello', { signal: controller.signal }), { name: 'AbortError' });
  await assert.rejects(f.service.synthesizeSpeech('Hello', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(f.calls.length, 0);
  assert.equal(f.speech.requests, 0);
  assert.equal(f.timers.size, 0);
});

test('speech timeout also bounds an in-progress audio save and removes its late artifact', async () => {
  let finishWrite;
  const f = fixture({ fileWrite: () => new Promise(resolve => { finishWrite = resolve; }) });
  const result = f.service.synthesizeSpeech('Hello');
  const callback = f.speech.success(success);
  f.expire();
  await rejectsCode(result, 'SPEECH_TIMEOUT', 504);
  finishWrite();
  await callback;
  assert.equal(f.speech.removed.includes(f.speech.files[0].file), true);
  assert.equal(f.speech.closed, 1);
  assert.equal(f.timers.size, 0);
});

test('audio write failure removes any partial file and returns a fixed speech error', async () => {
  const f = fixture({ fileWrite: async () => { throw new Error('SECRET file path'); } });
  const result = f.service.synthesizeSpeech('Hello');
  await f.speech.success(success);
  await rejectsCode(result, 'SPEECH_UNAVAILABLE', 502);
  assert.equal(f.speech.removed.includes(f.speech.files[0].file), true);
  assert.equal(f.speech.closed, 1);
  assert.equal(f.timers.size, 0);
});

for (const [azureCode, code, status] of [
  [1, 'CONFIGURATION_ERROR', 503], [3, 'RATE_LIMITED', 429], [8, 'RATE_LIMITED', 429],
  [5, 'SPEECH_TIMEOUT', 504], [6, 'SPEECH_UNAVAILABLE', 502]
]) {
  test(`Azure cancellation ${azureCode} retains its safe numeric code and maps to ${code}`, async () => {
    const f = fixture();
    const properties = new azureSdk.PropertyCollection();
    properties.setProperty('CancellationErrorCode', azureSdk.CancellationErrorCode[azureCode]);
    const cancellation = new azureSdk.SpeechSynthesisResult('fixture', azureSdk.ResultReason.Canceled, undefined, 'SECRET raw provider detail', properties);
    const result = f.service.synthesizeSpeech('Hello');
    await f.speech.success(cancellation);
    await assert.rejects(result, error => {
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      assert.equal(error.upstreamCode, azureCode);
      assert.equal(error.upstreamStatus, null);
      assert.equal(JSON.stringify(error).includes('SECRET'), false);
      return true;
    });
    assert.equal(f.speech.closed, 1);
    assert.equal(f.timers.size, 0);
  });
}
