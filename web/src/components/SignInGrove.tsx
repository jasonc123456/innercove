import { useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";

/**
 * Decorative frame for the sign-in page. It reuses the Daily check-in sapling's
 * leaf silhouette, vein, and rounded branch stroke, but it is not a check-in:
 * colors live in component state only and never touch mood logs or the hub.
 */

const LEAF_SHAPE = "M0 0C5-6.5 14-8.5 23 0C14 8.5 5 6.5 0 0Z";

const PALETTE = [
  { fill: "#f6b84b", vein: "#6d5239", veinOpacity: 0.85 },
  { fill: "#55a66a", vein: "#ffffff", veinOpacity: 0.78 },
  { fill: "#54a8bb", vein: "#ffffff", veinOpacity: 0.8 },
  { fill: "#8a7ab8", vein: "#ffffff", veinOpacity: 0.82 },
  { fill: "#ca6d82", vein: "#5c2433", veinOpacity: 0.7 },
] as const;

type Spot = { x: number; y: number; angle: number; scale: number };

/** Leaf bases are the endpoints of the branch curves below, so each one sits on a stroke. */
const DESKTOP_SPOTS: Spot[] = [
  { x: 300, y: 112, angle: -63, scale: 2.1 },
  { x: 176, y: 74, angle: -153, scale: 1.55 },
  { x: 340, y: 246, angle: -60, scale: 1.45 },
  { x: 246, y: 330, angle: 158, scale: 1.15 },
  { x: 308, y: 560, angle: -36, scale: 1.75 },
];

const MOBILE_TOP: Spot[] = [
  { x: 78, y: 16, angle: -24, scale: 1.2 },
  { x: 40, y: 72, angle: 36, scale: 1.05 },
];

const MOBILE_BOTTOM: Spot[] = [{ x: 58, y: 52, angle: -58, scale: 1.2 }];

const DESKTOP_START = [0, 1, 2, 3, 4, 1, 3, 0, 4, 2];
const MOBILE_START = [0, 2, 4, 1, 3, 1];

function cycle(colors: number[], index: number) {
  return colors.map((value, i) => (i === index ? (value + 1) % PALETTE.length : value));
}

export function SignInGrove() {
  const [desktop, setDesktop] = useState(DESKTOP_START);
  const [mobile, setMobile] = useState(MOBILE_START);

  return (
    <div className="sign-in-grove pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <svg
        className="grove-desktop absolute inset-0 h-full w-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <g aria-hidden="true">
          <GroveBranches />
          <g transform="translate(1440 0) scale(-1 1)">
            <GroveBranches />
          </g>
        </g>
        <LeafSet
          spots={DESKTOP_SPOTS}
          colors={desktop}
          start={0}
          hit={26}
          onCycle={(index) => setDesktop((current) => cycle(current, index))}
        />
        <g transform="translate(1440 0) scale(-1 1)">
          <LeafSet
            spots={DESKTOP_SPOTS}
            colors={desktop}
            start={DESKTOP_SPOTS.length}
            hit={26}
            onCycle={(index) => setDesktop((current) => cycle(current, index))}
          />
        </g>
      </svg>

      <div className="grove-mobile absolute inset-0">
        <Corner className="grove-corner grove-corner-tl" viewBox="0 0 160 140">
          <g aria-hidden="true">
            <TopSprig />
          </g>
          <LeafSet
            spots={MOBILE_TOP}
            colors={mobile}
            start={0}
            hit={34}
            onCycle={(index) => setMobile((current) => cycle(current, index))}
          />
        </Corner>
        <Corner className="grove-corner grove-corner-tr" viewBox="0 0 160 140">
          <g aria-hidden="true" transform="translate(160 0) scale(-1 1)">
            <TopSprig />
          </g>
          <g transform="translate(160 0) scale(-1 1)">
            <LeafSet
              spots={MOBILE_TOP}
              colors={mobile}
              start={MOBILE_TOP.length}
              hit={34}
              onCycle={(index) => setMobile((current) => cycle(current, index))}
            />
          </g>
        </Corner>
        <Corner className="grove-corner grove-corner-bl" viewBox="0 0 160 140">
          <g aria-hidden="true">
            <BottomSprig />
          </g>
          <LeafSet
            spots={MOBILE_BOTTOM}
            colors={mobile}
            start={MOBILE_TOP.length * 2}
            hit={34}
            onCycle={(index) => setMobile((current) => cycle(current, index))}
          />
        </Corner>
        <Corner className="grove-corner grove-corner-br" viewBox="0 0 160 140">
          <g aria-hidden="true" transform="translate(160 0) scale(-1 1)">
            <BottomSprig />
          </g>
          <g transform="translate(160 0) scale(-1 1)">
            <LeafSet
              spots={MOBILE_BOTTOM}
              colors={mobile}
              start={MOBILE_TOP.length * 2 + MOBILE_BOTTOM.length}
              hit={34}
              onCycle={(index) => setMobile((current) => cycle(current, index))}
            />
          </g>
        </Corner>
      </div>
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

function GroveBranches() {
  return (
    <>
      <path d="M0 848c46-28 98-24 150-6 28 10 36 28 36 42H0z" fill="var(--grove-ground)" />
      <ellipse cx="78" cy="874" rx="52" ry="11" fill="var(--grove-shade)" opacity="0.75" />
      <path
        d="M68 870C110 760 150 680 186 600C230 500 200 410 246 330C292 240 270 170 300 112"
        fill="none"
        stroke="var(--grove-branch)"
        strokeWidth="28"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M300 112C260 92 220 96 176 74"
        fill="none"
        stroke="var(--grove-branch)"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d="M246 330C290 300 320 280 340 246"
        fill="none"
        stroke="var(--grove-branch)"
        strokeWidth="16"
        strokeLinecap="round"
      />
      <path
        d="M186 600C230 578 270 588 308 560"
        fill="none"
        stroke="var(--grove-branch)"
        strokeWidth="16"
        strokeLinecap="round"
      />
    </>
  );
}

function TopSprig() {
  return (
    <>
      <path
        d="M0 30C26 22 48 10 78 16"
        fill="none"
        stroke="var(--grove-branch)"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d="M10 2C20 28 18 52 40 72"
        fill="none"
        stroke="var(--grove-branch)"
        strokeWidth="12"
        strokeLinecap="round"
      />
    </>
  );
}

function BottomSprig() {
  return (
    <>
      <path d="M0 128c22-12 40-8 58 8 8 8 10 12 10 12H0z" fill="var(--grove-ground)" />
      <path
        d="M8 132C28 108 32 78 58 52"
        fill="none"
        stroke="var(--grove-branch)"
        strokeWidth="14"
        strokeLinecap="round"
      />
    </>
  );
}

function LeafSet({
  spots,
  colors,
  start,
  hit,
  onCycle,
}: {
  spots: readonly Spot[];
  colors: number[];
  start: number;
  hit: number;
  onCycle: (index: number) => void;
}) {
  return (
    <>
      {spots.map((spot, offset) => {
        const index = start + offset;
        const colorIndex = colors[index] ?? 0;
        return (
          <DecorativeLeaf
            key={index}
            spot={spot}
            colorIndex={colorIndex}
            hit={hit}
            label={`Change decorative leaf ${index + 1} color.`}
            onCycle={() => onCycle(index)}
          />
        );
      })}
    </>
  );
}

function DecorativeLeaf({
  spot,
  colorIndex,
  hit,
  label,
  onCycle,
}: {
  spot: Spot;
  colorIndex: number;
  hit: number;
  label: string;
  onCycle: () => void;
}) {
  const swatch = PALETTE[colorIndex] ?? PALETTE[0];

  function onPointerDown(event: PointerEvent<SVGGElement>) {
    if (event.button !== 0) return;
    event.currentTarget.dataset.armed = "pointer";
    onCycle();
  }

  function onClick(event: MouseEvent<SVGGElement>) {
    if (event.currentTarget.dataset.armed === "pointer") {
      delete event.currentTarget.dataset.armed;
      return;
    }
    onCycle();
  }

  function onKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (event.repeat) return;
    onCycle();
  }

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      transform={`translate(${spot.x} ${spot.y}) rotate(${spot.angle})`}
      className="grove-leaf"
      onPointerDown={onPointerDown}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <circle cx="12" cy="0" r={hit} fill="transparent" />
      <g transform={`scale(${spot.scale})`} pointerEvents="none">
        <path className="grove-leaf-fill" d={LEAF_SHAPE} fill={swatch.fill} />
        <path
          className="grove-leaf-vein"
          d="M2 0H18"
          stroke={swatch.vein}
          strokeOpacity={swatch.veinOpacity}
          strokeWidth="1.15"
          strokeLinecap="round"
        />
      </g>
    </g>
  );
}
