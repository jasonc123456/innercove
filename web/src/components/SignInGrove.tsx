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
      <div className="grove-desktop">
        <div className="grove-side grove-side-left">
          <SideFrame
            colors={desktop}
            start={0}
            onCycle={(index) => setDesktop((current) => cycle(current, index))}
          />
        </div>
        <div className="grove-side grove-side-right">
          <div className="grove-mirror">
            <SideFrame
              colors={desktop}
              start={DESKTOP_SPOTS.length}
              onCycle={(index) => setDesktop((current) => cycle(current, index))}
            />
          </div>
        </div>
      </div>

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

function SideFrame({
  colors,
  start,
  onCycle,
}: {
  colors: number[];
  start: number;
  onCycle: (index: number) => void;
}) {
  return (
    <div className="relative h-full w-full">
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${SIDE_W} ${SIDE_H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <SideBranches />
      </svg>
      {DESKTOP_SPOTS.map((spot, offset) => {
        const index = start + offset;
        return (
          <PinnedLeaf
            key={index}
            spot={spot}
            colorIndex={colors[index] ?? 0}
            label={`Change decorative leaf ${index + 1} color.`}
            onCycle={() => onCycle(index)}
          />
        );
      })}
    </div>
  );
}

function SideBranches() {
  return (
    <>
      <path d="M0 742c40-26 92-22 140-4 24 10 30 24 30 36H0z" fill="var(--grove-ground)" />
      <ellipse cx="72" cy="762" rx="48" ry="10" fill="var(--grove-shade)" opacity="0.75" />
      <path
        d="M44 748C86 640 120 540 156 450C196 350 170 260 214 176C250 108 236 78 248 52"
        fill="none"
        stroke="var(--grove-branch)"
        strokeWidth="30"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M248 52C210 36 170 34 128 22"
        fill="none"
        stroke="var(--grove-branch)"
        strokeWidth="16"
        strokeLinecap="round"
      />
      <path
        d="M214 176C260 150 300 160 336 132"
        fill="none"
        stroke="var(--grove-branch)"
        strokeWidth="18"
        strokeLinecap="round"
      />
      <path
        d="M156 450C210 420 260 440 304 404"
        fill="none"
        stroke="var(--grove-branch)"
        strokeWidth="18"
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

function PinnedLeaf({
  spot,
  colorIndex,
  label,
  onCycle,
}: {
  spot: Spot;
  colorIndex: number;
  label: string;
  onCycle: () => void;
}) {
  const swatch = PALETTE[colorIndex] ?? PALETTE[0];
  return (
    <svg
      role="button"
      tabIndex={0}
      aria-label={label}
      viewBox="0 -8.5 23 17"
      className="grove-leaf grove-leaf-pin"
      style={{
        left: `${(spot.x / SIDE_W) * 100}%`,
        top: `${(spot.y / SIDE_H) * 100}%`,
        width: `calc(${spot.scale} * 8cqmin)`,
        height: `calc(${spot.scale} * 8cqmin * 17 / 23)`,
        transform: `translateY(-50%) rotate(${spot.angle}deg)`,
      }}
      {...leafHandlers(onCycle)}
    >
      <path className="grove-leaf-fill" d={LEAF_SHAPE} fill={swatch.fill} />
      <path
        className="grove-leaf-vein"
        d="M2 0H18"
        stroke={swatch.vein}
        strokeOpacity={swatch.veinOpacity}
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </svg>
  );
}

function leafHandlers(onCycle: () => void) {
  return {
    onPointerDown(event: PointerEvent<SVGElement>) {
      if (event.button !== 0) return;
      event.currentTarget.dataset.armed = "pointer";
      onCycle();
    },
    onClick(event: MouseEvent<SVGElement>) {
      if (event.currentTarget.dataset.armed === "pointer") {
        delete event.currentTarget.dataset.armed;
        return;
      }
      onCycle();
    },
    onKeyDown(event: KeyboardEvent<SVGElement>) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (event.repeat) return;
      onCycle();
    },
  };
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

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      transform={`translate(${spot.x} ${spot.y}) rotate(${spot.angle})`}
      className="grove-leaf"
      {...leafHandlers(onCycle)}
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
