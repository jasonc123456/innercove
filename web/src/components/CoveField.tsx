import { useEffect, useLayoutEffect, useRef } from "react";
import { createSpring, runSpringLoop, stepSpring, type Spring } from "../motion/spring";
import { usePrefersReducedMotion } from "../motion/usePrefersReducedMotion";

type Mode = "sign-in" | "create";

type Ripple = {
  el: HTMLSpanElement;
  x: number;
  y: number;
  scale: Spring;
};

const LIGHT_RESPONSE = 0.22;
const DEPTH_RESPONSE = 0.7;
const RIPPLE_RESPONSE = 0.55;

/**
 * Still water behind the account card.
 * The light follows the pointer from its current position (critically damped),
 * farther layers drift a few pixels for depth, and a tap on open water
 * leaves one ripple. Nothing moves on its own.
 */
export function CoveField({ mode }: { mode: Mode }) {
  const reduced = usePrefersReducedMotion();
  const fieldRef = useRef<HTMLDivElement>(null);
  const lightRef = useRef<HTMLDivElement>(null);
  const farRef = useRef<HTMLDivElement>(null);
  const nearRef = useRef<HTMLDivElement>(null);
  const shoreRef = useRef<HTMLDivElement>(null);
  const ripplesRef = useRef<HTMLDivElement>(null);
  const warmthRef = useRef(createSpring(mode === "create" ? 1 : 0));
  const kickRef = useRef<() => void>(() => {});

  useEffect(() => {
    warmthRef.current.target = mode === "create" ? 1 : 0;
    if (reduced) {
      warmthRef.current.value = warmthRef.current.target;
      warmthRef.current.velocity = 0;
      paintWarmth(farRef.current, nearRef.current, warmthRef.current.value);
      return;
    }
    kickRef.current();
  }, [mode, reduced]);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    const light = lightRef.current;
    const far = farRef.current;
    const near = nearRef.current;
    const shore = shoreRef.current;
    const ripplesEl = ripplesRef.current;
    if (!field || !light || !far || !near || !shore || !ripplesEl) return;

    if (reduced) {
      light.style.removeProperty("transform");
      far.style.removeProperty("transform");
      near.style.removeProperty("transform");
      shore.style.removeProperty("transform");
      ripplesEl.replaceChildren();
      paintWarmth(far, near, warmthRef.current.value);
      return;
    }

    const rect = () => field.getBoundingClientRect();
    const box = rect();
    const origin = { x: box.width * 0.72, y: box.height * 0.26 };
    const lightX = createSpring(origin.x);
    const lightY = createSpring(origin.y);
    const depthX = createSpring(0);
    const depthY = createSpring(0);
    const ripples: Ripple[] = [];
    let touchId: number | null = null;
    let pointed = false;

    const placeLight = () => {
      light.style.transform = `translate3d(${lightX.value}px, ${lightY.value}px, 0)`;
    };
    placeLight();

    const aim = (clientX: number, clientY: number) => {
      const bounds = rect();
      lightX.target = clientX - bounds.left;
      lightY.target = clientY - bounds.top;
      const cx = bounds.left + bounds.width / 2;
      const cy = bounds.top + bounds.height / 2;
      depthX.target = clamp((clientX - cx) / Math.max(bounds.width / 2, 1), -1, 1);
      depthY.target = clamp((clientY - cy) / Math.max(bounds.height / 2, 1), -1, 1);
      pointed = true;
      kickRef.current();
    };

    const spawn = (clientX: number, clientY: number) => {
      const bounds = rect();
      while (ripples.length >= 3) ripples.shift()?.el.remove();
      const x = clientX - bounds.left;
      const y = clientY - bounds.top;
      const el = document.createElement("span");
      el.className = "cove-ripple";
      el.style.opacity = "0.45";
      el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(0.18)`;
      ripplesEl.appendChild(el);
      const scale = createSpring(0.18);
      scale.target = 1;
      ripples.push({ el, x, y, scale });
      kickRef.current();
    };

    const loop = runSpringLoop((dt) => {
      let moving = false;
      moving = stepSpring(lightX, dt, LIGHT_RESPONSE) || moving;
      moving = stepSpring(lightY, dt, LIGHT_RESPONSE) || moving;
      moving = stepSpring(depthX, dt, DEPTH_RESPONSE) || moving;
      moving = stepSpring(depthY, dt, DEPTH_RESPONSE) || moving;
      moving = stepSpring(warmthRef.current, dt, 0.5) || moving;

      placeLight();
      const px = depthX.value;
      const py = depthY.value;
      far.style.transform = `translate3d(${px * 12}px, ${py * 10}px, 0)`;
      near.style.transform = `translate3d(${px * -26}px, ${py * -18}px, 0)`;
      shore.style.transform = `translate3d(${px * -14}px, ${py * -8}px, 0)`;
      paintWarmth(far, near, warmthRef.current.value);

      for (let i = ripples.length - 1; i >= 0; i -= 1) {
        const ripple = ripples[i]!;
        moving = stepSpring(ripple.scale, dt, RIPPLE_RESPONSE) || moving;
        const progress = clamp((ripple.scale.value - 0.18) / 0.82, 0, 1);
        ripple.el.style.opacity = String(0.45 * (1 - progress));
        ripple.el.style.transform = `translate3d(${ripple.x}px, ${ripple.y}px, 0) scale(${ripple.scale.value})`;
        if (ripple.scale.value === 1 && ripple.scale.velocity === 0) {
          ripple.el.remove();
          ripples.splice(i, 1);
        }
      }

      return moving;
    });
    kickRef.current = loop.kick;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      aim(event.clientX, event.clientY);
      if (event.pointerType === "touch") touchId = event.pointerId;
      if (event.target instanceof Element && event.target.closest("[data-cove-still]")) return;
      spawn(event.clientX, event.clientY);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        if (event.pointerId !== touchId) return;
      }
      aim(event.clientX, event.clientY);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId === touchId) touchId = null;
    };

    const onResize = () => {
      if (pointed) return;
      const bounds = rect();
      lightX.target = bounds.width * 0.72;
      lightY.target = bounds.height * 0.26;
      lightX.value = lightX.target;
      lightY.value = lightY.target;
      lightX.velocity = 0;
      lightY.velocity = 0;
      placeLight();
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("resize", onResize);

    return () => {
      kickRef.current = () => {};
      loop.stop();
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("resize", onResize);
      ripplesEl.replaceChildren();
    };
  }, [reduced]);

  return (
    <div ref={fieldRef} className="cove-field" aria-hidden="true">
      <div ref={farRef} className="cove-depth cove-depth-far" />
      <div ref={nearRef} className="cove-depth cove-depth-near" />
      <div ref={shoreRef} className="cove-shore">
        <svg viewBox="0 0 1200 480" preserveAspectRatio="none" fill="none">
          <path
            d="M0 300C180 200 380 160 600 214C840 274 1000 330 1200 250V480H0Z"
            fill="rgb(30 79 76 / 0.07)"
          />
          <path
            d="M0 268C190 168 360 140 560 186C780 238 960 310 1200 228"
            stroke="rgb(30 79 76 / 0.22)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M0 324C230 268 460 258 720 304C940 342 1060 348 1200 318"
            stroke="rgb(255 255 255 / 0.75)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div ref={lightRef} className="cove-light" />
      <div ref={ripplesRef} />
    </div>
  );
}

function paintWarmth(far: HTMLElement | null, near: HTMLElement | null, warmth: number) {
  if (far) far.style.opacity = String(1 - warmth * 0.4);
  if (near) near.style.opacity = String(0.45 + warmth * 0.55);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
