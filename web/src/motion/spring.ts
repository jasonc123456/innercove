export type Spring = {
  value: number;
  velocity: number;
  target: number;
};

export function createSpring(value: number, target = value): Spring {
  return { value, velocity: 0, target };
}

/**
 * Critically damped step. `response` is Apple's response time in seconds
 * (how quickly the value arrives), not a fixed duration.
 * Velocity is in units per second and is carried into the next step,
 * so a retarget mid-flight does not snap or hard-cut.
 */
export function stepSpring(spring: Spring, dt: number, response = 0.4): boolean {
  if (dt <= 0) return false;
  const omega = (2 * Math.PI) / response;
  const delta = spring.value - spring.target;
  const carry = spring.velocity + omega * delta;
  const decay = Math.exp(-omega * dt);
  const predicted = delta + carry * dt;
  spring.value = spring.target + predicted * decay;
  spring.velocity = (carry - omega * predicted) * decay;

  const settled = Math.abs(spring.value - spring.target) < 0.05 && Math.abs(spring.velocity) < 0.5;
  if (settled) {
    spring.value = spring.target;
    spring.velocity = 0;
    return false;
  }
  return true;
}

/** Display-synced loop. `step` returns true while anything is still moving. */
export function runSpringLoop(step: (dt: number) => boolean): { kick: () => void; stop: () => void } {
  let frame = 0;
  let running = false;
  let last = 0;

  const tick = (now: number) => {
    if (!running) return;
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    if (step(dt)) frame = requestAnimationFrame(tick);
    else running = false;
  };

  return {
    kick() {
      if (running) return;
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(frame);
    },
  };
}
