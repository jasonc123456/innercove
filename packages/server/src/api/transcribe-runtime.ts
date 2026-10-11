import { spawn } from "node:child_process";
import { access, mkdtemp, rm, statfs, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { ApiErrorCode, TranscriptionMediaType, TranscriptionResponse } from "@innercove/core";

export class TranscriptionError extends Error {
  constructor(readonly code: ApiErrorCode, message: string) { super(message); }
}
export interface Transcriber {
  transcribe(audio: Buffer, mediaType: TranscriptionMediaType, signal: AbortSignal): Promise<TranscriptionResponse>;
}
export const invalidAudio = () => new TranscriptionError("VALIDATION_ERROR", "Invalid, silent or overlong audio");
const unavailable = () => new TranscriptionError("MODEL_UNAVAILABLE", "Local transcription unavailable");

/** No shell, child output logging or detached children. Await close after kill. */
export function runLocal(binary: string, args: string[], signal: AbortSignal, maxOutput: number, onExitFailure: () => TranscriptionError = invalidAudio): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(unavailable());
    const child = spawn(binary, args, { shell: false, stdio: ["ignore", "pipe", "ignore"] });
    const parts: Buffer[] = []; let bytes = 0; let failure: Error | undefined;
    const abort = () => { failure = unavailable(); child.kill("SIGKILL"); };
    signal.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxOutput) { failure = invalidAudio(); child.kill("SIGKILL"); }
      else parts.push(chunk);
    });
    child.once("error", () => { failure = unavailable(); });
    child.once("close", code => {
      signal.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(onExitFailure());
      else resolve(Buffer.concat(parts));
    });
  });
}

/** Hard-bound decoded sample count, never container metadata/client duration. */
export function inspectPcm(pcm: Buffer) {
  if (!pcm.length || pcm.length % 2 || pcm.length > 60 * 16000 * 2) throw invalidAudio();
  let squared = 0;
  for (let i = 0; i < pcm.length; i += 2) squared += pcm.readInt16LE(i) ** 2;
  if (Math.sqrt(squared / (pcm.length / 2)) < 50) throw invalidAudio();
  return pcm.length / 32;
}
function wav(pcm: Buffer) {
  const header = Buffer.alloc(44);
  header.write("RIFF"); header.writeUInt32LE(pcm.length + 36, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
export interface WhisperConfig { binary: string; model: string; ffmpeg: string; tempRoot?: string; }
export class WhisperTranscriber implements Transcriber {
  constructor(readonly config: WhisperConfig) {}
  async transcribe(audio: Buffer, mediaType: TranscriptionMediaType, signal: AbortSignal) {
    const root = this.config.tempRoot ?? "/dev/shm";
    try {
      await access(this.config.binary, constants.X_OK); await access(this.config.ffmpeg, constants.X_OK);
      await access(this.config.model, constants.R_OK);
      // Audio/transcript scratch must stay in RAM; no plaintext disk fallback.
      if (Number((await statfs(root)).type) !== 0x01021994) throw unavailable();
    } catch { throw unavailable(); }
    const dir = await mkdtemp(path.join(root, "innercove-stt-"));
    try {
      const input = path.join(dir, "input");
      await writeFile(input, audio, { mode: 0o600 });
      const demuxer = { "audio/webm": "matroska", "audio/ogg": "ogg", "audio/mp4": "mov", "audio/wav": "wav" }[mediaType];
      const pcm = await runLocal(this.config.ffmpeg, ["-nostdin", "-v", "error", "-max_alloc", "67108864", "-threads", "1", "-filter_threads", "1", "-protocol_whitelist", "file,pipe", "-f", demuxer, "-i", input, "-map", "0:a:0", "-vn", "-sn", "-dn", "-t", "60.0000625", "-ac", "1", "-ar", "16000", "-f", "s16le", "pipe:1"], signal, 1920002);
      const durationMs = inspectPcm(pcm);
      const decoded = path.join(dir, "decoded.wav");
      await writeFile(decoded, wav(pcm), { mode: 0o600 });
      const text = (await runLocal(this.config.binary, ["-ng", "-t", "2", "-l", "en", "-nt", "-np", "-sns", "-m", this.config.model, "-f", decoded], signal, 64000, unavailable)).toString("utf8").trim();
      if (!text || text === "[BLANK_AUDIO]" || text.length > 16000) throw invalidAudio();
      return { text, durationMs };
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
}
export function configuredTranscriber(): Transcriber {
  const { STT_WHISPER_BIN: binary, STT_MODEL_PATH: model, STT_FFMPEG_BIN: ffmpeg } = process.env;
  if (!binary || !model || !ffmpeg || ![binary, model, ffmpeg].every(path.isAbsolute)) {
    return { async transcribe() { throw unavailable(); } };
  }
  return new WhisperTranscriber({ binary, model, ffmpeg });
}
