const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEnvironment } = require('../provider-smoke.cjs');

test('rejects missing and placeholder credentials without disclosing values', () => {
  const result = validateEnvironment({ OPENAI_API_KEY: 'your_openai_api_key_here', AZURE_SPEECH_KEY: 'your_azure_speech_key_here', AZURE_SPEECH_REGION: 'westus' }, 'full');
  assert.deepEqual(result, ['OPENAI_API_KEY', 'AZURE_SPEECH_KEY']);
  assert.deepEqual(validateEnvironment({}, 'model'), ['OPENAI_API_KEY']);
});

test('independent speech and model checks require only their own settings', () => {
  assert.deepEqual(validateEnvironment({ OPENAI_API_KEY: 'test-only-not-a-real-key' }, 'model'), []);
  assert.deepEqual(validateEnvironment({ AZURE_SPEECH_KEY: 'test-only-not-a-real-key', AZURE_SPEECH_REGION: 'westus' }, 'speech'), []);
});
