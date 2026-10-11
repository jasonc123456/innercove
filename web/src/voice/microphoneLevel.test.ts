import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { microphoneLevel } from './microphoneLevel';
let tick: FrameRequestCallback;
let rms: number;
let reduced: boolean;
const disconnect = vi.fn();
const sourceDisconnect = vi.fn();
const close = vi.fn().mockResolvedValue(undefined);
const resume = vi.fn().mockResolvedValue(undefined);
const connect = vi.fn();
const stream = { getTracks: vi.fn() } as unknown as MediaStream;
class Context {
  close = close; resume = resume;
  createMediaStreamSource = vi.fn((input: MediaStream) => { expect(input).toBe(stream); return { connect, disconnect: sourceDisconnect }; });
  createAnalyser = vi.fn(() => ({ fftSize: 1024, disconnect, getFloatTimeDomainData: (data: Float32Array) => data.fill(rms) }));
}
beforeEach(() => {
  vi.clearAllMocks(); rms = 0; reduced = false;
  resume.mockResolvedValue(undefined);
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { tick = callback; return 7; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced; } }));
});
afterEach(() => vi.unstubAllGlobals());
it('reads actual samples, suppresses noise, smooths speech and clamps loud input', () => {
  const update = vi.fn(); const dispose = microphoneLevel(stream, update);
  tick(0); expect(update).toHaveBeenLastCalledWith(0);
  rms = .005; tick(50); expect(update).toHaveBeenLastCalledWith(0);
  rms = .02; tick(100); const quiet = update.mock.lastCall![0]; expect(quiet).toBeGreaterThan(0); expect(quiet).toBeLessThan(1);
  rms = 1; for (let t = 150; t < 1000; t += 50) tick(t);
  expect(update.mock.lastCall![0]).toBeLessThanOrEqual(1);
  expect(connect).toHaveBeenCalledTimes(1); expect(stream.getTracks).not.toHaveBeenCalled(); dispose();
});
it('disposes frame/nodes/context idempotently without stopping recording tracks', () => {
  const update = vi.fn(); const dispose = microphoneLevel(stream, update); const late = tick;
  dispose(); dispose(); late(100);
  expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
  expect(disconnect).toHaveBeenCalledTimes(1); expect(sourceDisconnect).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1); expect(update).toHaveBeenLastCalledWith(0);
  expect(stream.getTracks).not.toHaveBeenCalled();
});
it('updates reduced-motion levels only every 250ms', () => {
  reduced = true; const update = vi.fn(); const dispose = microphoneLevel(stream, update);
  tick(0); tick(50); tick(100); expect(update).toHaveBeenCalledTimes(1);
  tick(250); expect(update).toHaveBeenCalledTimes(2); dispose();
});
it('falls back when Web Audio is absent or initialization throws', () => {
  vi.stubGlobal('AudioContext', undefined); expect(() => microphoneLevel(stream, vi.fn())()).not.toThrow();
  vi.stubGlobal('AudioContext', class extends Context { createAnalyser = () => { throw new Error('device'); }; });
  microphoneLevel(stream, vi.fn())(); expect(close).toHaveBeenCalledTimes(1);
});
it('cleans up if resume rejects or sample reading fails', async () => {
  resume.mockRejectedValueOnce(new Error('blocked')); microphoneLevel(stream, vi.fn()); await Promise.resolve();
  expect(close).toHaveBeenCalledTimes(1);
  vi.stubGlobal('AudioContext', class extends Context { createAnalyser = () => ({ fftSize: 1024, disconnect, getFloatTimeDomainData: () => { throw new Error('failed'); } }); });
  microphoneLevel(stream, vi.fn()); tick(0); expect(close).toHaveBeenCalledTimes(2);
});
