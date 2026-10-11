import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRecording, appendTranscript } from './recording';
class Recorder {
  static isTypeSupported = vi.fn((type: string) => type === 'audio/ogg;codecs=opus');
  static latest: Recorder;
  state = 'inactive'; mimeType = 'audio/ogg;codecs=opus';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor() { Recorder.latest = this; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['fictional audio']) }); void this.onstop?.(); }
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
describe('recording-to-draft controller (mocked browser)', () => {
  let trackStop: ReturnType<typeof vi.fn>; let getUserMedia: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>; let draft: ReturnType<typeof vi.fn>; let controller: VoiceRecording;
  beforeEach(() => {
    vi.useFakeTimers(); trackStop = vi.fn(); getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] });
    vi.stubGlobal('isSecureContext', true); vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    vi.stubGlobal('MediaRecorder', Recorder); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'fictional draft', durationMs: 1000 }) }));
    update = vi.fn(); draft = vi.fn(); controller = new VoiceRecording(update, draft);
  });
  afterEach(() => { controller.cancel(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
  it.each(['stop', 'cancel', 'error', 'deadline'])('disposes the level meter on %s through the real controller', async action => {
    const close = vi.fn().mockResolvedValue(undefined);
    const disconnect = vi.fn(); const connect = vi.fn();
    const createSource = vi.fn(); const frameCancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 42));
    vi.stubGlobal('cancelAnimationFrame', frameCancel);
    vi.stubGlobal('AudioContext', class {
      close = close;
      resume = () => Promise.resolve();
      createMediaStreamSource(stream: unknown) { createSource(stream); return { connect, disconnect }; }
      createAnalyser() { return { fftSize: 1024, disconnect, getFloatTimeDomainData: vi.fn() }; }
    });
    await controller.start();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(createSource).toHaveBeenCalledTimes(1);
    expect(trackStop).not.toHaveBeenCalled();
    if (action === 'stop') controller.stop();
    if (action === 'cancel') controller.cancel();
    if (action === 'error') Recorder.latest.onerror?.();
    if (action === 'deadline') await vi.advanceTimersByTimeAsync(60000);
    await flush();
    expect(frameCancel).toHaveBeenCalledWith(42);
    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(trackStop).toHaveBeenCalled();
  });
  it('still transcribes when Web Audio construction fails', async () => {
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('optional visualization'); } });
    await controller.start(); controller.stop(); await flush();
    expect(draft).toHaveBeenCalledWith('fictional draft');
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
  it('probes format, uploads raw Blob, releases tracks and only produces a draft', async () => {
    await controller.start(); expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    controller.stop(); await flush(); expect(trackStop).toHaveBeenCalled(); expect(draft).toHaveBeenCalledWith('fictional draft');
    expect(fetch).toHaveBeenCalledWith('/api/transcribe', expect.objectContaining({ method: 'POST', body: expect.any(Blob), credentials: 'same-origin', headers: { 'Content-Type': 'audio/ogg;codecs=opus' } }));
    expect(appendTranscript('typed while recording', 'voice')).toBe('typed while recording\nvoice');
  });
  it('automatically stops after 60 seconds', async () => {
    await controller.start(); await vi.advanceTimersByTimeAsync(60000); expect(fetch).toHaveBeenCalledTimes(1); expect(trackStop).toHaveBeenCalled();
  });
  it('cancel discards recording without uploading', async () => {
    await controller.start(); controller.cancel(); await flush(); expect(fetch).not.toHaveBeenCalled(); expect(draft).not.toHaveBeenCalled(); expect(trackStop).toHaveBeenCalled();
  });
  it('releases a permission result arriving after cancellation', async () => {
    let resolve!: (value: unknown) => void; getUserMedia.mockReturnValue(new Promise(r => { resolve = r; }));
    const starting = controller.start(); controller.cancel(); resolve({ getTracks: () => [{ stop: trackStop }] }); await starting;
    expect(trackStop).toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('aborts pending upload and suppresses late transcript after session cancellation', async () => {
    let resolve!: (value: unknown) => void; vi.mocked(fetch).mockReturnValue(new Promise(r => { resolve = r; }));
    await controller.start(); controller.stop(); const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    controller.cancel(); expect(signal?.aborted).toBe(true);
    resolve({ ok: true, json: async () => ({ text: 'late draft', durationMs: 1000 }) }); await flush(); expect(draft).not.toHaveBeenCalled();
  });
  it.each([401,423,409,400,503])('handles HTTP %s with content-free error', async status => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status } as Response); await controller.start(); controller.stop(); await flush();
    expect(draft).not.toHaveBeenCalled(); expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'idle', error: expect.any(String) }));
  });
  it('rejects unsupported browser and permission denial without leaking error text', async () => {
    getUserMedia.mockRejectedValue(new Error('PRIVATE DEVICE')); await controller.start(); expect(JSON.stringify(update.mock.calls)).not.toContain('PRIVATE DEVICE');
    vi.stubGlobal('isSecureContext', false); vi.stubGlobal('navigator', {}); await controller.start(); expect(fetch).not.toHaveBeenCalled();
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'idle', error: expect.stringContaining('http address') }));
  });
  it('records on a plain-http LAN address when the browser allows the microphone', async () => {
    vi.stubGlobal('isSecureContext', false); await controller.start(); expect(getUserMedia).toHaveBeenCalled();
  });
  it('rejects oversized chunks and recording errors without submitting', async () => {
    await controller.start(); Recorder.latest.ondataavailable?.({ data: new Blob([new Uint8Array(4194305)]) }); await flush(); expect(fetch).not.toHaveBeenCalled(); expect(trackStop).toHaveBeenCalled();
    await controller.start(); Recorder.latest.onerror?.(); expect(fetch).not.toHaveBeenCalled();
  });
  it('bounds processing time and rejects malformed responses', async () => {
    vi.mocked(fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('timeout')))));
    await controller.start(); controller.stop(); await vi.advanceTimersByTimeAsync(105000); expect(draft).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ text: '', durationMs: 61000 }) } as Response);
    await controller.start(); controller.stop(); await flush(); expect(draft).not.toHaveBeenCalled();
  });
});
