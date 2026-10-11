// web/ is its own npm project (D44) and can't import @innercove/core: neither the web Docker
// stage, the dev web container nor CI's web job has the workspace packages. These mirror
// packages/core/src/api/transcribe.ts (B's contract); keep them in step with it.
const TRANSCRIPTION_MAX_BYTES = 4 * 1024 * 1024;
const TRANSCRIPTION_MAX_SECONDS = 60;
function parseTranscription(body: unknown): { text: string; durationMs: number } | null {
  if (!body || typeof body !== 'object') return null;
  const { text, durationMs, ...rest } = body as Record<string, unknown>;
  if (Object.keys(rest).length > 0 || typeof text !== 'string' || typeof durationMs !== 'number') return null;
  const trimmed = text.trim();
  if (trimmed.length < 1 || trimmed.length > 16000 || !(durationMs > 0) || durationMs > 60000) return null;
  return { text: trimmed, durationMs };
}

export type VoiceState = { phase: 'idle' | 'requesting' | 'recording' | 'processing'; seconds: number; error?: string };
export function appendTranscript(draft: string, text: string) { return draft ? `${draft}\n${text}` : text; }
export class VoiceRecording {
  private generation = 0;
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private abort?: AbortController;
  private timer?: ReturnType<typeof setInterval>;
  private deadline?: ReturnType<typeof setTimeout>;
  private phase: VoiceState['phase'] = 'idle';
  private update: (state: VoiceState) => void;
  private draft: (text: string) => void;
  constructor(update: (state: VoiceState) => void, draft: (text: string) => void) { this.update = update; this.draft = draft; }
  private publish(phase: VoiceState['phase'], seconds = 0, error?: string) {
    this.phase = phase; this.update({ phase, seconds, error });
  }
  private release() {
    clearInterval(this.timer); clearTimeout(this.deadline);
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = undefined;
  }
  cancel() {
    this.generation++; this.abort?.abort(); this.abort = undefined;
    const recorder = this.recorder; this.recorder = undefined;
    if (recorder) {
      recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    this.release(); this.publish('idle');
  }
  stop() {
    if (this.phase !== 'recording') return;
    this.publish('processing');
    this.recorder?.stop(); this.release();
  }
  async start() {
    if (this.phase !== 'idle') return;
    const id = ++this.generation;
    let chunks: Blob[] = []; let bytes = 0;
    const fail = (message: string) => { if (id === this.generation) { this.cancel(); this.publish('idle', 0, message); } };
    this.publish('requesting');
    try {
      if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        fail('Recording needs a supported browser on localhost or HTTPS.'); return;
      }
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg']
        .find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) { fail('This browser has no supported recording format.'); return; }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (id !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
      this.recorder = recorder;
      recorder.ondataavailable = event => {
        if (id !== this.generation) return;
        bytes += event.data.size;
        if (bytes > TRANSCRIPTION_MAX_BYTES) { chunks = []; fail('Recording is too large. Please record a shorter clip.'); return; }
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => { chunks = []; fail('Recording failed. Please try again.'); };
      recorder.onstop = async () => {
        if (id !== this.generation) return;
        this.release(); this.recorder = undefined; this.publish('processing');
        const blob = new Blob(chunks, { type: recorder.mimeType }); chunks = [];
        if (!blob.size) { fail('No audio was recorded.'); return; }
        const controller = new AbortController(); this.abort = controller;
        const timeout = setTimeout(() => controller.abort(), 105000);
        try {
          const response = await fetch('/api/transcribe', { method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': blob.type }, body: blob, signal: controller.signal });
          if (id !== this.generation) return;
          if (!response.ok) {
            const message = response.status === 401 ? 'Sign in to the hub before transcribing.' : response.status === 423 ? 'Unlock the hub before transcribing.' : response.status === 409 ? 'Transcription is busy. Try again shortly.' : response.status === 400 ? 'Audio could not be transcribed. Try a shorter, clearer recording.' : 'Local transcription is unavailable. Please try again later.';
            fail(message); return;
          }
          const result = parseTranscription(await response.json());
          if (id !== this.generation) return;
          if (!result) { fail('The transcription response was invalid.'); return; }
          this.draft(result.text); this.publish('idle');
        } catch { fail('Transcription stopped or the hub could not be reached.'); }
        finally { clearTimeout(timeout); if (this.abort === controller) this.abort = undefined; }
      };
      recorder.start(1000); this.publish('recording');
      const began = performance.now();
      this.timer = setInterval(() => this.update({ phase: 'recording', seconds: Math.min(60, Math.floor((performance.now() - began) / 1000)) }), 250);
      this.deadline = setTimeout(() => this.stop(), TRANSCRIPTION_MAX_SECONDS * 1000);
    } catch { chunks = []; fail('Microphone access failed. Check browser permission and the hub microphone policy.'); }
  }
}
