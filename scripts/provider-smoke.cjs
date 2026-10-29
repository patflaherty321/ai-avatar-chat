const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { parseArgs } = require('node:util');

function validateEnvironment(env, mode) {
  const required = mode === 'model' ? ['OPENAI_API_KEY'] : mode === 'speech'
    ? ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION']
    : ['OPENAI_API_KEY', 'AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'];
  return required.filter(name => !env[name]?.trim() || /^your_.*_here$/i.test(env[name].trim()));
}

async function main() {
  const { values } = parseArgs({ options: { env: { type: 'string' }, mode: { type: 'string', default: 'full' } } });
  if (!['model', 'speech', 'full'].includes(values.mode)) throw new Error('INVALID_MODE');
  const env = values.env
    ? { ...process.env, ...require('../backend/node_modules/dotenv').parse(await fs.readFile(values.env)) }
    : process.env;
  const missing = validateEnvironment(env, values.mode);
  if (missing.length) {
    console.log(JSON.stringify({ check: values.mode, ok: false, code: 'CONFIGURATION_REQUIRED', variables: missing }));
    process.exitCode = 2;
    return;
  }
  const { createChatService } = require('../backend/services/chatService');
  const audioDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-companion-smoke-'));
  const service = createChatService({ env, audioDir });
  const started = Date.now();
  try {
    let text = 'Hello! Tom & Jerry say <hello>.';
    let aiMs;
    let speechMs;
    let audioBytes;
    let visemeCount;
    if (values.mode !== 'speech') {
      const before = Date.now();
      text = await service.generateResponse('Say a short, friendly greeting.');
      aiMs = Date.now() - before;
    }
    if (values.mode !== 'model') {
      const before = Date.now();
      const speech = await service.synthesizeSpeech(text);
      speechMs = Date.now() - before;
      audioBytes = (await fs.stat(speech.audioPath)).size;
      visemeCount = speech.visemes.length;
      if (!audioBytes || !speech.visemes.some(v => v.visemeId !== 0)) throw new Error('INVALID_SPEECH_RESULT');
    }
    console.log(JSON.stringify({ check: values.mode, ok: true, model: service.model, aiMs, speechMs, totalMs: Date.now() - started, textCharacters: text.length, audioBytes, visemeCount }));
  } catch (error) {
    // Only our stable service codes are printable; never echo a provider payload.
    const code = typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : 'SMOKE_FAILED';
    console.log(JSON.stringify({ check: values.mode, ok: false, code, totalMs: Date.now() - started }));
    process.exitCode = 1;
  } finally {
    await fs.rm(audioDir, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch(() => {
  console.log(JSON.stringify({ ok: false, code: 'SMOKE_SETUP_FAILED' }));
  process.exitCode = 1;
});

module.exports = { validateEnvironment };
