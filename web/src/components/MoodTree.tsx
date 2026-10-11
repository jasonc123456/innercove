import { treeStage, type DailyCheckIn } from "../../../packages/core/src/tree-growth";
import { moodStyle } from "../check-ins/moods";

const SAPLING_BRANCHES = [
  { d: "M129 135c-19-14-33-26-43-45", width: 7, from: 0 },
  { d: "M130 118c17-13 31-28 38-46", width: 7, from: 0 },
  { d: "M128 92c-15-10-25-23-28-39", width: 6, from: 3 },
  { d: "M130 93c13-11 22-24 25-39", width: 6, from: 3 },
  { d: "M128 91c-1-8 0-15 1-21", width: 7, from: 6 },
  { d: "M129 71c-9-9-14-20-15-32", width: 5, from: 6 },
  { d: "M129 71c9-9 14-20 15-33", width: 5, from: 6 },
];
const SAPLING_SPOTS = [[86,90,-134],[168,72,-50],[100,53,-126],[155,54,-57],[104,114,165],[114,39,-115],[144,38,-66],[153,97,12],[146,75,-18],[129,70,-90],[126,108,-140],[130,128,-20],[130,168,-140]];

/** Intentional attachment points sampled from the visible curved branches.
 * Large trees group earlier days, never delete or count their moods as progress. */
export function treeArt(count: number) {
  const stage = treeStage(count);
  if (stage === 1) return { stage, width: 260, height: 210, ground: 188, trunk: "M130 188C129 154 131 122 128 91", branches: SAPLING_BRANCHES.filter(b => count >= b.from), spots: SAPLING_SPOTS };
  const width = stage === 2 ? 320 : 400;
  const height = stage === 2 ? 260 : 320;
  const ground = height - 30, center = width / 2;
  const tiers = stage === 2 ? [[194,75],[157,105],[120,95],[83,65],[55,35]] : [[244,90],[219,115],[194,130],[169,130],[144,115],[119,100],[94,80],[69,55]];
  const parameters = stage === 2 ? [.4,.75,1] : [.25,.5,.75,1];
  const branches: { d: string; width: number }[] = [];
  const spots: number[][] = [];
  for (const [y, spread] of tiers) for (const side of [-1, 1]) {
    const tipX = center + side * spread, tipY = y - 25;
    const bendX = center + side * spread * .6, bendY = y - 4;
    branches.push({ d: `M${center} ${y}Q${bendX} ${bendY} ${tipX} ${tipY}`, width: stage === 2 ? 6 : 7 });
    for (const t of parameters) {
      const x = (1-t)**2*center + 2*(1-t)*t*bendX + t*t*tipX;
      const py = (1-t)**2*y + 2*(1-t)*t*bendY + t*t*tipY;
      const angle = Math.atan2(2*(1-t)*(bendY-y)+2*t*(tipY-bendY), 2*(1-t)*(bendX-center)+2*t*(tipX-bendX))*180/Math.PI;
      spots.push([x,py,angle]);
    }
  }
  // Fill tips across the whole canopy before nearer-trunk positions.
  const canopy = parameters.flatMap((_t, order) => spots.filter((_spot, index) => index % parameters.length === parameters.length - 1 - order));
  return { stage, width, height, ground, trunk: `M${center} ${ground}Q${center-4} ${height/2} ${center} 40`, branches, spots: stage === 2 ? canopy.slice(0,29) : canopy };
}
export function MoodTree({ days, evolving = false }: { days: DailyCheckIn[]; evolving?: boolean }) {
  const art = treeArt(days.length);
  const shown = days.slice(-art.spots.length), grouped = days.length - shown.length;
  return <div className="mt-5 rounded-3xl bg-[#e8f1e6] px-2 py-3 lg:mt-0" aria-label={`Growing mood tree with ${days.length} unique daily leaves, stage ${art.stage}`}>
    <svg key={art.stage} viewBox={`0 0 ${art.width} ${art.height}`} className={`mx-auto block h-56 max-w-full lg:h-80 ${evolving ? "tree-evolving" : ""}`} role="img">
      <title>{["", "Your sapling", "Your growing tree", "Your flourishing tree"][art.stage]}</title>
      <desc>{days.length} days of checking in, regardless of mood. {grouped ? `${grouped} earlier days are grouped; all days remain in your history.` : "Each leaf represents one day."}</desc>
      <path d={`M0 ${art.ground-2}Q${art.width/2} ${art.ground+16} ${art.width} ${art.ground-4}V${art.height}H0Z`} fill="#c7dfc2" />
      <path d={art.trunk} fill="none" stroke="#6d5239" strokeWidth={art.stage === 1 ? 10 : art.stage === 2 ? 13 : 17} strokeLinecap="round" />
      {art.branches.map(b => <path key={b.d} d={b.d} fill="none" stroke="#6d5239" strokeWidth={b.width} strokeLinecap="round" />)}
      <ellipse cx={art.width/2} cy={art.ground+2} rx={art.stage === 3 ? 55 : 33} ry="7" fill="#a6c99e" opacity=".75" />
      {shown.map((day,index) => {
        const [x,y,angle] = art.spots[index];
        return <g key={day.day} transform={`translate(${x} ${y}) rotate(${angle})`}><title>{`${day.day}: ${moodStyle(day.mood).label}`}</title><g className="tree-leaf">
          <path d="M0 0C5-6.5 14-8.5 23 0C14 8.5 5 6.5 0 0Z" fill={moodStyle(day.mood).color} />
          <path d="M2 0H18" stroke="#fff" strokeOpacity=".35" strokeWidth="1" strokeLinecap="round" />
        </g></g>;
      })}
      {!days.length && <circle cx="128" cy="86" r="11" fill="#91bf81" opacity=".9" />}
    </svg>
    {grouped > 0 && <p className="text-center text-xs text-ink/70">{grouped} earlier days are gathered into your tree&apos;s roots. Every day is kept in your history.</p>}
  </div>;
}
