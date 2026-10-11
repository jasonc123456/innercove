/** Ephemeral microphone level only: no playback, storage or sample logging. */
export function microphoneLevel(stream: MediaStream, update: (level: number) => void): () => void {
  let context: AudioContext | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let analyser: AnalyserNode | undefined;
  let frame: number | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (frame !== undefined) cancelAnimationFrame(frame);
    try { source?.disconnect(); } catch { /* optional visualization */ }
    try { analyser?.disconnect(); } catch { /* optional visualization */ }
    if (context) { try { void context.close().catch(() => {}); } catch { /* optional visualization */ } }
    update(0);
  };
  try {
    if (typeof AudioContext === 'undefined' || typeof requestAnimationFrame === 'undefined') return dispose;
    context = new AudioContext();
    source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser); // Never connect to context.destination.
    const samples = new Float32Array(analyser.fftSize);
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    let smooth = 0;
    let previous = -Infinity;
    const tick = (now: number) => {
      if (disposed) return;
      try {
        if (now - previous >= (reduced?.matches ? 250 : 50)) {
          previous = now;
          analyser!.getFloatTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
          // Noise floor .008; sqrt compresses speech dynamics into a visible range.
          const target = Math.min(1, Math.sqrt(Math.max(0, rms - .008) / .12));
          smooth += (target - smooth) * .25;
          update(smooth);
        }
        frame = requestAnimationFrame(tick);
      } catch { dispose(); } // Recording continues if visualization fails.
    };
    frame = requestAnimationFrame(tick);
    void context.resume().catch(dispose);
  } catch { dispose(); }
  return dispose;
}
