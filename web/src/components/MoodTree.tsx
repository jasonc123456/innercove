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
  const width = stage === 2 ? 360 : 440;
  const height = stage === 2 ? 340 : 440;
  const ground = height - 24;
  // A spreading deciduous silhouette: primary limbs rise out of the trunk,
  // with forks attached to those limbs rather than horizontal tiers.
  // Coordinates are fractions of the canvas, shared across growing stages.
  const limbs = [
    [.50,.78,.31,.73,.12,.43], [.50,.72,.68,.65,.87,.40],
    [.49,.61,.34,.47,.25,.20], [.50,.55,.66,.40,.73,.17],
    [.49,.43,.43,.29,.47,.10], [.50,.45,.55,.29,.58,.08],
    [.30,.65,.18,.62,.08,.58], [.24,.57,.24,.44,.14,.30],
    [.69,.58,.81,.58,.92,.53], [.76,.51,.77,.37,.88,.25],
    [.36,.39,.24,.36,.19,.27], [.63,.34,.70,.27,.82,.23],
    [.47,.23,.37,.19,.34,.12], [.55,.25,.65,.20,.66,.10],
    [.40,.71,.35,.57,.36,.48], [.60,.67,.62,.53,.59,.44],
  ];
  if (stage === 3) limbs.push(
    [.19,.53,.10,.46,.07,.35], [.82,.47,.91,.42,.94,.33],
    [.29,.29,.28,.19,.21,.14], [.68,.25,.76,.18,.78,.10],
    [.15,.58,.10,.65,.07,.66], [.85,.54,.91,.62,.94,.63],
  );
  const branches: { d: string; width: number }[] = [];
  const attachments: number[][][] = [];
  const parameters = stage === 2 ? [1,.64] : [1,.72,.42];
  for (const [index, limb] of limbs.entries()) {
    // Snap each fork to its nearest primary limb so joints remain connected.
    if (index >= 6) {
      let nearest = [limb[0],limb[1]], distance = Infinity;
      for (const primary of limbs.slice(0,6)) for (let step=0;step<=100;step++) {
        const t=step/100;
        const x=(1-t)**2*primary[0]+2*(1-t)*t*primary[2]+t*t*primary[4];
        const y=(1-t)**2*primary[1]+2*(1-t)*t*primary[3]+t*t*primary[5];
        const candidate=(x-limb[0])**2+(y-limb[1])**2;
        if(candidate<distance){distance=candidate;nearest=[x,y];}
      }
      limb[0]=nearest[0];limb[1]=nearest[1];
    }
    const [x,y,bx,by,tx,ty] = limb.map((n,i) => n * (i % 2 ? height : width));
    branches.push({ d: `M${x} ${y}Q${bx} ${by} ${tx} ${ty}`, width: index < 6 ? (stage === 2 ? 8 : 11) : (stage === 2 ? 4 : 5) });
    attachments.push(parameters.map(t => [
      (1-t)**2*x + 2*(1-t)*t*bx + t*t*tx,
      (1-t)**2*y + 2*(1-t)*t*by + t*t*ty,
      Math.atan2((1-t)*(by-y)+t*(ty-by),(1-t)*(bx-x)+t*(tx-bx))*180/Math.PI,
    ]));
  }
  // First fill the outer canopy, then work inward along the same branches.
  const spots = parameters.flatMap((_t,i) => attachments.map(points => points[i]));
  return { stage, width, height, ground,
    trunk: `M${width*.5} ${ground}Q${width*.48} ${height*.68} ${width*.5} ${height*.43}`,
    branches, spots: spots.slice(0,stage === 2 ? 29 : 64) };

}
export function MoodTree({ days, evolving = false }: { days: DailyCheckIn[]; evolving?: boolean }) {
  const art = treeArt(days.length);
  const shown = days.slice(-art.spots.length), grouped = days.length - shown.length;
  return <div className="mt-5 rounded-3xl bg-[#e8f1e6] px-2 py-3 lg:mt-0" aria-label={`Growing mood tree with ${days.length} unique daily leaves, stage ${art.stage}`}>
    <svg key={art.stage} viewBox={`0 0 ${art.width} ${art.height}`} className={`mx-auto block max-w-full mood-tree-art mood-tree-stage-${art.stage} ${evolving ? "tree-evolving" : ""}`} role="img">
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
