import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ENCOURAGEMENT, pickEncouragement } from "../content/encouragement";

/**
 * Decorative frame for the sign-in page. It reuses the Daily check-in sapling's
 * leaf silhouette, vein, and rounded branch stroke. Growth plays once, from CSS,
 * when this tree mounts. It is not a check-in. Leaf color is local to each leaf.
 *
 * Timing (seconds). The last desktop leaf settles at about 3.6s.
 * Change these numbers to retune the grow; the CSS durations below are the fallbacks.
 */
const GROW = {
  side: 0.38,
  trunk: 1.95,
  twig: 0.7,
  leaf: 0.74,
  mobileTrunk: 2.15,
  mobileTwig: 1.2,
} as const;

const LEAF_SHAPE = "M0 0C5-6.5 14-8.5 23 0C14 8.5 5 6.5 0 0Z";

const PALETTE = [
  { fill: "#f6b84b", vein: "#6d5239", veinOpacity: 0.85 },
  { fill: "#55a66a", vein: "#ffffff", veinOpacity: 0.78 },
  { fill: "#54a8bb", vein: "#ffffff", veinOpacity: 0.8 },
  { fill: "#8a7ab8", vein: "#ffffff", veinOpacity: 0.82 },
  { fill: "#ca6d82", vein: "#5c2433", veinOpacity: 0.7 },
] as const;

type Spot = { x: number; y: number; angle: number; scale: number };

/** Side-panel viewBox. Leaf bases are the endpoints of the curves in SideBranches. */
const SIDE_W = 400;
const SIDE_H = 780;
const DESKTOP_SPOTS: Spot[] = [
  { x: 248, y: 52, angle: -65, scale: 2 },
  { x: 128, y: 22, angle: -164, scale: 1.4 },
  { x: 336, y: 132, angle: -38, scale: 1.55 },
  { x: 214, y: 176, angle: 145, scale: 1.15 },
  { x: 304, y: 404, angle: -39, scale: 1.7 },
];

/** When each desktop leaf opens, relative to its side. Order matches DESKTOP_SPOTS. */
const DESKTOP_LEAF_AT = [1.9, 2.42, 1.72, 1.16, 1.12];
const DESKTOP_TILT = [-14, 11, -9, 15, -12];
const DESKTOP_COLORS = [0, 1, 2, 3, 4, 1, 3, 0, 4, 2];

const MOBILE_TOP: Spot[] = [
  { x: 78, y: 16, angle: -24, scale: 1.2 },
  { x: 40, y: 72, angle: 36, scale: 1.05 },
];
const MOBILE_TOP_AT = [1.85, 2.05];
const MOBILE_BOTTOM: Spot[] = [{ x: 58, y: 52, angle: -58, scale: 1.2 }];
const MOBILE_COLORS = [0, 2, 4, 1, 3, 1];

/** Green, yellow, blue, purple, pink, then green again. Indexes into PALETTE. */
const COLOR_CYCLE = [1, 0, 2, 3, 4] as const;
const MESSAGE_INK = "#1a120c";
const SPECIAL_DESKTOP = "d-1-4";
const SPECIAL_MOBILE = "m-br-0";
const COLOR_MS = 300;
const FALL_MS = 780;

type Phase = "attached" | "shifting" | "falling" | "landed" | "open" | "returning";
type Box = { left: number; top: number; width: number; height: number };
type LeafNode = HTMLButtonElement | SVGGElement;

function nextLeafColor(current: number) {
  const at = COLOR_CYCLE.indexOf(current as (typeof COLOR_CYCLE)[number]);
  return COLOR_CYCLE[(at < 0 ? 0 : at + 1) % COLOR_CYCLE.length];
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function overlaps(box: Box, rect: DOMRect | undefined) {
  if (!rect || rect.width < 1 || rect.height < 1) return false;
  return box.left < rect.right && box.left + box.width > rect.left && box.top < rect.bottom && box.top + box.height > rect.top;
}

/** Smallest phone card that still holds every message in three or four lines. */
const MIN_PHONE_CARD_H = 176;

/** Enlarged leaf at the lower right, clear of the sign-in form and Get help. */
function messageLeafBox(): Box {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const desktop = vw >= 1024;
  const margin = 16;
  const form = document.querySelector(".sign-in-page form")?.getBoundingClientRect();
  const help = document.querySelector(".sign-in-page a[href='/help']")?.getBoundingClientRect();
  if (!desktop) {
    const phone = phoneLeafBox(vw, vh, margin, form, help);
    if (phone) return phone;
  }
  const gutter = (vw - Math.min(vw - 32, 448)) / 2;
  let width = desktop ? Math.min(288, Math.max(220, gutter - 36)) : Math.min(236, vw - margin * 2);
  let height = Math.round(Math.max(width * (17 / 23), desktop ? 196 : 168));
  width = Math.min(Math.round(height * (23 / 17)), vw - margin * 2);
  height = Math.round(width * (17 / 23));

  let left = Math.max(margin, vw - margin - width);
  let top = vh - margin - height;
  if (help && help.height > 1) top = Math.min(top, help.top - 12 - height);
  if (form && form.height > 1 && overlaps({ left, top, width, height }, form)) {
    const floor = help && help.height > 1 ? help.top - 12 : vh - margin;
    const gap = floor - (form.bottom + 12);
    if (gap > 148) {
      height = Math.min(height, gap);
      width = Math.min(Math.round(height * (23 / 17)), vw - margin * 2);
      height = Math.round(width * (17 / 23));
      left = Math.max(margin, vw - margin - width);
      top = floor - height;
    } else {
      top = Math.max(margin, form.bottom + 12);
    }
  }
  top = Math.max(margin, Math.min(top, vh - margin - height));
  left = Math.max(margin, Math.min(left, vw - margin - width));
  if (help && help.height > 1 && overlaps({ left, top, width, height }, help)) {
    top = Math.max(margin, help.top - 12 - height);
  }
  return { left, top, width, height };
}

/**
 * Phones rarely have room beside the form, so try the lower right, then the gap
 * above Get help, then the space above the form. Null keeps the older fallback.
 */
function phoneLeafBox(vw: number, vh: number, margin: number, form?: DOMRect, help?: DOMRect): Box | null {
  const fullWidth = Math.min(264, vw - margin * 2);
  const fullHeight = Math.round(fullWidth * (17 / 23));
  const hasForm = !!form && form.height > 1;
  const hasHelp = !!help && help.height > 1;
  const floor = hasHelp ? help.top - 12 : vh - margin;
  const sized = (height: number, top: number): Box => {
    const width = Math.min(Math.round(height * (23 / 17)), fullWidth);
    return { left: vw - margin - width, top, width, height: Math.round(width * (17 / 23)) };
  };
  const clear = (box: Box) =>
    box.top >= margin &&
    box.top + box.height <= vh - margin &&
    !(hasForm && overlaps(box, form)) &&
    !(hasHelp && overlaps(box, help));

  const corner = sized(fullHeight, floor - fullHeight);
  if (clear(corner)) return corner;
  if (!hasForm) return null;

  const gaps = [
    { top: form.bottom + 12, bottom: floor },
    { top: margin, bottom: form.top - 12 },
  ];
  for (const gap of gaps) {
    const height = Math.min(fullHeight, gap.bottom - gap.top);
    if (height < MIN_PHONE_CARD_H) continue;
    const box = sized(height, gap.bottom - height);
    if (clear(box)) return box;
  }
  return null;
}

function initialColors() {
  const colors: Record<string, number> = {};
  DESKTOP_COLORS.forEach((color, index) => {
    colors[`d-${index < DESKTOP_SPOTS.length ? 0 : 1}-${index % DESKTOP_SPOTS.length}`] = color;
  });
  (
    [
      ["m-tl-0", 0],
      ["m-tl-1", 1],
      ["m-tr-0", 2],
      ["m-tr-1", 3],
      ["m-bl-0", 4],
      ["m-br-0", 5],
    ] as const
  ).forEach(([id, index]) => {
    colors[id] = MOBILE_COLORS[index] ?? 0;
  });
  return colors;
}

export function SignInGrove() {
  const [colors, setColors] = useState(initialColors);
  const [phase, setPhase] = useState<Phase>("attached");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [messageIndex, setMessageIndex] = useState<number | null>(null);
  const phaseRef = useRef<Phase>("attached");
  const previousMessage = useRef<number | null>(null);
  const returnFocus = useRef(false);
  const leafRefs = useRef<Record<string, LeafNode | null>>({});
  const landedRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);
  const closeCardRef = useRef<() => void>(() => {});

  phaseRef.current = phase;

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) window.clearTimeout(id);
    };
  }, []);

  useEffect(() => {
    if (phase === "landed") landedRef.current?.focus();
    if (phase === "open") closeRef.current?.focus();
    if (phase === "attached" && returnFocus.current && activeId) {
      returnFocus.current = false;
      leafRefs.current[activeId]?.focus();
    }
  }, [phase, activeId]);

  useEffect(() => {
    if (phase !== "open") return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeCardRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  useEffect(() => {
    if (phase !== "landed" && phase !== "open") return;
    function onResize() {
      setBox(messageLeafBox());
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  function remember(id: string, node: LeafNode | null) {
    leafRefs.current[id] = node;
  }

  function measure(id: string | null): Box | null {
    if (!id) return null;
    const node = leafRefs.current[id];
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  function later(ms: number, action: () => void) {
    const id = window.setTimeout(action, ms);
    timers.current.push(id);
  }

  function activateLeaf(id: string, node: LeafNode) {
    if (id !== SPECIAL_DESKTOP && id !== SPECIAL_MOBILE) {
      setColors((current) => ({ ...current, [id]: nextLeafColor(current[id] ?? 0) }));
      return;
    }
    if (phaseRef.current !== "attached") return;
    const from = node.getBoundingClientRect();
    const start = { left: from.left, top: from.top, width: from.width, height: from.height };
    const land = messageLeafBox();
    setColors((current) => ({ ...current, [id]: nextLeafColor(current[id] ?? 0) }));
    setActiveId(id);
    if (prefersReducedMotion()) {
      phaseRef.current = "landed";
      setBox(land);
      setPhase("landed");
      return;
    }
    phaseRef.current = "shifting";
    setPhase("shifting");
    later(COLOR_MS, () => {
      if (phaseRef.current !== "shifting") return;
      phaseRef.current = "falling";
      setBox(start);
      setPhase("falling");
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setBox(land));
      });
      later(FALL_MS, () => {
        if (phaseRef.current !== "falling") return;
        phaseRef.current = "landed";
        setPhase("landed");
      });
    });
  }

  function openMessage() {
    if (phaseRef.current !== "landed") return;
    const choice = pickEncouragement(previousMessage.current);
    previousMessage.current = choice;
    setMessageIndex(choice);
    phaseRef.current = "open";
    setPhase("open");
  }

  function closeCard() {
    if (phaseRef.current !== "open") return;
    returnFocus.current = true;
    if (prefersReducedMotion()) {
      phaseRef.current = "attached";
      setPhase("attached");
      return;
    }
    const back = measure(activeId);
    phaseRef.current = "returning";
    setPhase("returning");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (back) setBox(back);
      });
    });
    later(FALL_MS, () => {
      if (phaseRef.current !== "returning") return;
      phaseRef.current = "attached";
      setPhase("attached");
    });
  }
  closeCardRef.current = closeCard;

  const swatch = PALETTE[colors[activeId ?? ""] ?? 0] ?? PALETTE[0];
  const message = messageIndex === null ? null : ENCOURAGEMENT[messageIndex];
  const stage = phase === "falling" || phase === "landed" || phase === "open" || phase === "returning";

  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="sign-in-grove pointer-events-none absolute inset-0 overflow-hidden">
        <div className="grove-desktop">
          <div className="grove-side grove-side-left">
            <SideFrame lag={0} side={0} colors={colors} phase={phase} activeId={activeId} onLeaf={activateLeaf} remember={remember} />
          </div>
          <div className="grove-side grove-side-right">
            <div className="grove-mirror">
              <SideFrame lag={GROW.side} side={1} colors={colors} phase={phase} activeId={activeId} onLeaf={activateLeaf} remember={remember} />
            </div>
          </div>
        </div>

        <div className="grove-mobile absolute inset-0">
          <Corner className="grove-corner grove-corner-tl" viewBox="0 0 160 140">
            <g aria-hidden="true">
              <TopSprig lag={0.2} />
            </g>
            <LeafSet spots={MOBILE_TOP} idPrefix="m-tl" opensAt={MOBILE_TOP_AT} lag={0.2} colors={colors} phase={phase} activeId={activeId} onLeaf={activateLeaf} remember={remember} labelFrom={1} />
          </Corner>
          <Corner className="grove-corner grove-corner-tr" viewBox="0 0 160 140">
            <g transform="translate(160 0) scale(-1 1)">
              <g aria-hidden="true">
                <TopSprig lag={0.2 + GROW.side} />
              </g>
              <LeafSet spots={MOBILE_TOP} idPrefix="m-tr" opensAt={MOBILE_TOP_AT} lag={0.2 + GROW.side} colors={colors} phase={phase} activeId={activeId} onLeaf={activateLeaf} remember={remember} labelFrom={3} />
            </g>
          </Corner>
          <Corner className="grove-corner grove-corner-bl" viewBox="0 0 160 140">
            <g aria-hidden="true">
              <BottomSprig lag={0} />
            </g>
            <LeafSet spots={MOBILE_BOTTOM} idPrefix="m-bl" opensAt={[1.7]} lag={0} colors={colors} phase={phase} activeId={activeId} onLeaf={activateLeaf} remember={remember} labelFrom={5} />
          </Corner>
          <Corner className="grove-corner grove-corner-br" viewBox="0 0 160 140">
            <g transform="translate(160 0) scale(-1 1)">
              <g aria-hidden="true">
                <BottomSprig lag={GROW.side} />
              </g>
              <LeafSet spots={MOBILE_BOTTOM} idPrefix="m-br" opensAt={[1.7]} lag={GROW.side} colors={colors} phase={phase} activeId={activeId} onLeaf={activateLeaf} remember={remember} labelFrom={6} />
            </g>
          </Corner>
        </div>
      </div>

      {stage && box && activeId ? (
        <div
          className={phase === "open" ? "grove-card" : phase === "landed" ? "grove-flyer grove-landed" : "grove-flyer"}
          style={{ left: box.left, top: box.top, width: box.width, height: box.height, right: "auto", bottom: "auto", aspectRatio: "auto" }}
          role={phase === "open" ? "dialog" : undefined}
          aria-modal={phase === "open" ? false : undefined}
          aria-labelledby={phase === "open" ? "grove-encouragement" : undefined}
        >
          <svg className="grove-card-leaf" viewBox="0 -8.5 23 17" preserveAspectRatio="none" aria-hidden="true">
            <path className="grove-leaf-fill" d={LEAF_SHAPE} fill={swatch.fill} />
            {phase === "open" ? null : (
              <path
                className="grove-leaf-vein"
                d="M2 0H18"
                stroke={swatch.vein}
                strokeOpacity={swatch.veinOpacity}
                strokeWidth="1.15"
                strokeLinecap="round"
              />
            )}
          </svg>
          {phase === "landed" ? (
            <button
              type="button"
              ref={landedRef}
              className="grove-landed-hit"
              aria-label="Open encouragement"
              onClick={(event) => {
                event.stopPropagation();
                openMessage();
              }}
            />
          ) : null}
          {phase === "open" && message ? (
            <>
              <button
                type="button"
                ref={closeRef}
                className="grove-card-close"
                aria-label="Close encouragement"
                aria-describedby="grove-encouragement"
                onClick={(event) => {
                  event.stopPropagation();
                  closeCard();
                }}
              >
                ×
              </button>
              <p id="grove-encouragement" className="grove-message-text" style={{ color: MESSAGE_INK }}>
                {message}
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Corner({
  className,
  viewBox,
  children,
}: {
  className: string;
  viewBox: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <svg viewBox={viewBox} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        {children}
      </svg>
    </div>
  );
}

function SideFrame({
  lag,
  side,
  colors,
  phase,
  activeId,
  onLeaf,
  remember,
}: {
  lag: number;
  side: 0 | 1;
  colors: Record<string, number>;
  phase: Phase;
  activeId: string | null;
  onLeaf: (id: string, node: LeafNode) => void;
  remember: (id: string, node: LeafNode | null) => void;
}) {
  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${SIDE_W} ${SIDE_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <SideBranches lag={lag} />
      </svg>
      {DESKTOP_SPOTS.map((spot, offset) => {
        const id = `d-${side}-${offset}`;
        return (
          <PinnedLeaf
            key={offset}
            id={id}
            special={id === SPECIAL_DESKTOP}
            label={side * DESKTOP_SPOTS.length + offset + 1}
            spot={spot}
            colorIndex={colors[id] ?? 0}
            away={id === activeId && phase !== "attached" && phase !== "shifting"}
            delay={lag + (DESKTOP_LEAF_AT[offset] ?? 1) + offset * 0.04}
            tilt={DESKTOP_TILT[offset] ?? -12}
            sway={offset % 2 === 0 ? 1.45 : -1.35}
            onLeaf={onLeaf}
            remember={remember}
          />
        );
      })}
    </div>
  );
}

function SideBranches({ lag }: { lag: number }) {
  return (
    <>
      <path d="M0 742c40-26 92-22 140-4 24 10 30 24 30 36H0z" fill="var(--grove-ground)" />
      <ellipse cx="72" cy="762" rx="48" ry="10" fill="var(--grove-shade)" opacity="0.75" />
      <Branch d="M44 748C86 640 120 540 156 450C196 350 170 260 214 176C250 108 236 78 248 52" width={30} delay={lag} duration={GROW.trunk} />
      <Branch d="M248 52C210 36 170 34 128 22" width={16} delay={lag + 1.78} duration={GROW.twig} />
      <Branch d="M214 176C260 150 300 160 336 132" width={18} delay={lag + 1.18} duration={GROW.twig} />
      <Branch d="M156 450C210 420 260 440 304 404" width={18} delay={lag + 0.5} duration={GROW.twig} />
    </>
  );
}

function TopSprig({ lag }: { lag: number }) {
  return (
    <>
      <Branch d="M0 30C26 22 48 10 78 16" width={14} delay={lag + 0.7} duration={GROW.mobileTwig} />
      <Branch d="M10 2C20 28 18 52 40 72" width={12} delay={lag + 0.9} duration={GROW.mobileTwig} />
    </>
  );
}

function BottomSprig({ lag }: { lag: number }) {
  return (
    <>
      <path d="M0 128c22-12 40-8 58 8 8 8 10 12 10 12H0z" fill="var(--grove-ground)" />
      <Branch d="M8 132C28 108 32 78 58 52" width={14} delay={lag} duration={GROW.mobileTrunk} />
    </>
  );
}

function Branch({ d, width, delay, duration }: { d: string; width: number; delay: number; duration: number }) {
  return (
    <path
      d={d}
      fill="none"
      stroke="var(--grove-branch)"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength={1}
      className="grove-branch-draw"
      style={{ animationDelay: `${delay}s`, animationDuration: `${duration}s` }}
    />
  );
}

function LeafSet({
  spots,
  idPrefix,
  opensAt,
  lag,
  colors,
  phase,
  activeId,
  onLeaf,
  remember,
  labelFrom,
}: {
  spots: readonly Spot[];
  idPrefix: string;
  opensAt: readonly number[];
  lag: number;
  colors: Record<string, number>;
  phase: Phase;
  activeId: string | null;
  onLeaf: (id: string, node: LeafNode) => void;
  remember: (id: string, node: LeafNode | null) => void;
  labelFrom: number;
}) {
  return (
    <>
      {spots.map((spot, offset) => {
        const id = `${idPrefix}-${offset}`;
        return (
          <DecorativeLeaf
            key={offset}
            id={id}
            special={id === SPECIAL_MOBILE}
            label={labelFrom + offset}
            spot={spot}
            colorIndex={colors[id] ?? 0}
            away={id === activeId && phase !== "attached" && phase !== "shifting"}
            delay={lag + (opensAt[offset] ?? 1) + offset * 0.06}
            tilt={offset % 2 === 0 ? -12 : 10}
            sway={offset % 2 === 0 ? 1.45 : -1.35}
            onLeaf={onLeaf}
            remember={remember}
          />
        );
      })}
    </>
  );
}

function LeafArt({ colorIndex }: { colorIndex: number }) {
  const swatch = PALETTE[colorIndex] ?? PALETTE[0];
  return (
    <>
      <path className="grove-leaf-fill" d={LEAF_SHAPE} fill={swatch.fill} />
      <path
        className="grove-leaf-vein"
        d="M2 0H18"
        stroke={swatch.vein}
        strokeOpacity={swatch.veinOpacity}
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </>
  );
}

function Unfold({ delay, tilt, sway, children }: { delay: number; tilt: number; sway: number; children: ReactNode }) {
  const tiltStyle = {
    animationDelay: `${delay}s`,
    animationDuration: `${GROW.leaf}s`,
    "--leaf-tilt": `${tilt}deg`,
  } as CSSProperties;
  const swayStyle = {
    animationDelay: `${delay + GROW.leaf}s`,
    animationDuration: `${11 + Math.abs(tilt) / 10}s`,
    "--sway": `${sway}deg`,
  } as CSSProperties;
  return (
    <g className="grove-leaf-unfold" style={tiltStyle}>
      <g className="grove-leaf-sway" style={swayStyle}>
        {children}
      </g>
    </g>
  );
}

function leafLabel(special: boolean, label: number) {
  return special ? "Change encouragement leaf color" : `Change decorative leaf ${label} color`;
}

function PinnedLeaf({
  id,
  special,
  label,
  spot,
  colorIndex,
  away,
  delay,
  tilt,
  sway,
  onLeaf,
  remember,
}: {
  id: string;
  special: boolean;
  label: number;
  spot: Spot;
  colorIndex: number;
  away: boolean;
  delay: number;
  tilt: number;
  sway: number;
  onLeaf: (id: string, node: LeafNode) => void;
  remember: (id: string, node: LeafNode | null) => void;
}) {
  return (
    <button
      type="button"
      ref={(node) => remember(id, node)}
      className="grove-leaf grove-leaf-pin"
      aria-label={leafLabel(special, label)}
      aria-hidden={away || undefined}
      tabIndex={away ? -1 : 0}
      style={{
        left: `${(spot.x / SIDE_W) * 100}%`,
        top: `${(spot.y / SIDE_H) * 100}%`,
        width: `calc(${spot.scale} * 8cqmin)`,
        height: `calc(${spot.scale} * 8cqmin * 17 / 23)`,
        transform: `translateY(-50%) rotate(${spot.angle}deg)`,
        visibility: away ? "hidden" : "visible",
      }}
      onKeyDown={(event) => {
        if (event.repeat && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onClick={(event) => {
        event.stopPropagation();
        onLeaf(id, event.currentTarget);
      }}
    >
      <svg viewBox="0 -8.5 23 17" className="block h-full w-full overflow-visible" aria-hidden="true">
        <Unfold delay={delay} tilt={tilt} sway={sway}>
          <LeafArt colorIndex={colorIndex} />
        </Unfold>
      </svg>
    </button>
  );
}

function DecorativeLeaf({
  id,
  special,
  label,
  spot,
  colorIndex,
  away,
  delay,
  tilt,
  sway,
  onLeaf,
  remember,
}: {
  id: string;
  special: boolean;
  label: number;
  spot: Spot;
  colorIndex: number;
  away: boolean;
  delay: number;
  tilt: number;
  sway: number;
  onLeaf: (id: string, node: LeafNode) => void;
  remember: (id: string, node: LeafNode | null) => void;
}) {
  function onKeyDown(event: ReactKeyboardEvent<SVGGElement>) {
    if (event.repeat) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onLeaf(id, event.currentTarget);
  }

  return (
    <g
      ref={(node) => remember(id, node)}
      className="grove-leaf"
      role="button"
      tabIndex={away ? -1 : 0}
      aria-label={leafLabel(special, label)}
      aria-hidden={away || undefined}
      transform={`translate(${spot.x} ${spot.y}) rotate(${spot.angle})`}
      style={{ visibility: away ? "hidden" : "visible" }}
      onClick={(event) => {
        event.stopPropagation();
        onLeaf(id, event.currentTarget);
      }}
      onKeyDown={onKeyDown}
    >
      <g transform={`scale(${spot.scale})`}>
        <Unfold delay={delay} tilt={tilt} sway={sway}>
          <LeafArt colorIndex={colorIndex} />
        </Unfold>
      </g>
    </g>
  );
}

