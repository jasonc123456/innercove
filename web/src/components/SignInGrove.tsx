import type { CSSProperties, ReactNode } from "react";

/**
 * Decorative frame for the sign-in page. It reuses the Daily check-in sapling's
 * leaf silhouette, vein, and rounded branch stroke. Growth plays once, from CSS,
 * when this tree mounts. It is not a check-in and does not take pointer or keyboard input.
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

export function SignInGrove() {
  return (
    <div className="sign-in-grove pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="grove-desktop">
        <div className="grove-side grove-side-left">
          <SideFrame lag={0} colorFrom={0} />
        </div>
        <div className="grove-side grove-side-right">
          <div className="grove-mirror">
            <SideFrame lag={GROW.side} colorFrom={DESKTOP_SPOTS.length} />
          </div>
        </div>
      </div>

      <div className="grove-mobile absolute inset-0">
        <Corner className="grove-corner grove-corner-tl" viewBox="0 0 160 140">
          <TopSprig lag={0.2} />
          <LeafSet spots={MOBILE_TOP} colorFrom={0} opensAt={MOBILE_TOP_AT} lag={0.2} />
        </Corner>
        <Corner className="grove-corner grove-corner-tr" viewBox="0 0 160 140">
          <g transform="translate(160 0) scale(-1 1)">
            <TopSprig lag={0.2 + GROW.side} />
            <LeafSet spots={MOBILE_TOP} colorFrom={MOBILE_TOP.length} opensAt={MOBILE_TOP_AT} lag={0.2 + GROW.side} />
          </g>
        </Corner>
        <Corner className="grove-corner grove-corner-bl" viewBox="0 0 160 140">
          <BottomSprig lag={0} />
          <LeafSet spots={MOBILE_BOTTOM} colorFrom={MOBILE_TOP.length * 2} opensAt={[1.7]} lag={0} />
        </Corner>
        <Corner className="grove-corner grove-corner-br" viewBox="0 0 160 140">
          <g transform="translate(160 0) scale(-1 1)">
            <BottomSprig lag={GROW.side} />
            <LeafSet
              spots={MOBILE_BOTTOM}
              colorFrom={MOBILE_TOP.length * 2 + MOBILE_BOTTOM.length}
              opensAt={[1.7]}
              lag={GROW.side}
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

function SideFrame({ lag, colorFrom }: { lag: number; colorFrom: number }) {
  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${SIDE_W} ${SIDE_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <SideBranches lag={lag} />
      </svg>
      {DESKTOP_SPOTS.map((spot, offset) => (
        <PinnedLeaf
          key={offset}
          spot={spot}
          colorIndex={DESKTOP_COLORS[colorFrom + offset] ?? 0}
          delay={lag + (DESKTOP_LEAF_AT[offset] ?? 1) + offset * 0.04}
          tilt={DESKTOP_TILT[offset] ?? -12}
          sway={offset % 2 === 0 ? 1.45 : -1.35}
        />
      ))}
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
  colorFrom,
  opensAt,
  lag,
}: {
  spots: readonly Spot[];
  colorFrom: number;
  opensAt: readonly number[];
  lag: number;
}) {
  return (
    <>
      {spots.map((spot, offset) => (
        <DecorativeLeaf
          key={offset}
          spot={spot}
          colorIndex={MOBILE_COLORS[colorFrom + offset] ?? 0}
          delay={lag + (opensAt[offset] ?? 1) + offset * 0.06}
          tilt={offset % 2 === 0 ? -12 : 10}
          sway={offset % 2 === 0 ? 1.45 : -1.35}
        />
      ))}
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

function PinnedLeaf({
  spot,
  colorIndex,
  delay,
  tilt,
  sway,
}: {
  spot: Spot;
  colorIndex: number;
  delay: number;
  tilt: number;
  sway: number;
}) {
  return (
    <svg
      viewBox="0 -8.5 23 17"
      className="grove-leaf grove-leaf-pin"
      style={{
        left: `${(spot.x / SIDE_W) * 100}%`,
        top: `${(spot.y / SIDE_H) * 100}%`,
        width: `calc(${spot.scale} * 8cqmin)`,
        height: `calc(${spot.scale} * 8cqmin * 17 / 23)`,
        transform: `translateY(-50%) rotate(${spot.angle}deg)`,
      }}
    >
      <Unfold delay={delay} tilt={tilt} sway={sway}>
        <LeafArt colorIndex={colorIndex} />
      </Unfold>
    </svg>
  );
}

function DecorativeLeaf({
  spot,
  colorIndex,
  delay,
  tilt,
  sway,
}: {
  spot: Spot;
  colorIndex: number;
  delay: number;
  tilt: number;
  sway: number;
}) {
  return (
    <g className="grove-leaf" transform={`translate(${spot.x} ${spot.y}) rotate(${spot.angle})`}>
      <g transform={`scale(${spot.scale})`}>
        <Unfold delay={delay} tilt={tilt} sway={sway}>
          <LeafArt colorIndex={colorIndex} />
        </Unfold>
      </g>
    </g>
  );
}
