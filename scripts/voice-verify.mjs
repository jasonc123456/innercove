// Explicit isolated entry point; never used by main.ts or Compose.
import { mkdtempSync, readFileSync, rmSync, accessSync, constants, statfsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../packages/server/dist/app.js';
import { DatabaseStore } from '../packages/server/dist/store/db.js';
import { FakeProvider } from '../packages/server/dist/inference/fake.js';
import { loadSafetyConfigs, rulesSafety } from '../packages/server/dist/chat/rules-safety.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function createVoiceVerificationApp() {
  const directory = mkdtempSync(path.join(tmpdir(), 'innercove-voice-verify-'));
  const database = new DatabaseStore(path.join(directory, 'fictional.db'));
  let app;
  try {
    app = await buildApp({ database, provider: new FakeProvider(),
      safety: rulesSafety(loadSafetyConfigs()),
      systemPrompt: readFileSync(path.join(root, 'config/prompts/system-prompt.txt'), 'utf8').trim(),
      stats: { lastReply: null }, webDist: path.join(root, 'web/dist') }, false);
    app.addHook('onSend', async (_request, reply) => {
      const policy = String(reply.getHeader('permissions-policy') ?? '');
      // The main app now allows the microphone for its own origin; fail on any other policy.
      if (!policy.includes('microphone=()') && !policy.includes('microphone=(self)')) throw new Error('Unexpected microphone policy');
      reply.header('permissions-policy', policy.replace('microphone=()', 'microphone=(self)'));
    });
    app.addHook('onClose', async () => { rmSync(directory, { recursive: true, force: true }); });
    return { app, database, directory };
  } catch (error) {
    if (app) await app.close();
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node 22 or later required');
  const port = Number(process.env.VOICE_VERIFY_PORT ?? 18080);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || [8000,8001,1234].includes(port)) throw new Error('Choose an unused non-live test port');
  const runtime = path.join(homedir(), 'innercove-stt-hour1/whisper.cpp');
  process.env.STT_WHISPER_BIN = path.join(runtime, 'build/bin/whisper-cli');
  process.env.STT_MODEL_PATH = path.join(runtime, 'models/ggml-base.en.bin');
  process.env.STT_FFMPEG_BIN = '/usr/bin/ffmpeg';
  accessSync(process.env.STT_WHISPER_BIN, constants.X_OK);
  accessSync(process.env.STT_MODEL_PATH, constants.R_OK); // opened read-only by whisper; no model provisioning/writes
  accessSync(process.env.STT_FFMPEG_BIN, constants.X_OK);
  if (statfsSync('/dev/shm').type !== 0x01021994) throw new Error('Audio scratch must be tmpfs');
  accessSync(path.join(root, 'web/dist/index.html'), constants.R_OK);
  const { app, directory } = await createVoiceVerificationApp();
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.close().catch(() => { process.exitCode = 1; }); });
  try { await app.listen({ host: '127.0.0.1', port }); }
  catch (error) { await app.close(); throw error; }
  console.log(`Isolated voice test: http://127.0.0.1:${port}; fictional DB directory: ${directory}`);
  console.log('Real D47 sign-in required. Replies use FakeProvider; no Qwen traffic. Ctrl-C removes the test database.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
