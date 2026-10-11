/** Growth celebrates showing up, never the mood chosen. Shared by API and UI. */
export const TREE_GROWTH_THRESHOLDS = [0, 14, 30] as const;
export type TreeStage = 1 | 2 | 3;
export function treeStage(uniqueDays: number): TreeStage {
  return uniqueDays >= TREE_GROWTH_THRESHOLDS[2] ? 3 : uniqueDays >= TREE_GROWTH_THRESHOLDS[1] ? 2 : 1;
}
/** Match Settings' selected/device IANA zone. Stored day keys never get rebucketed. */
export function checkInDay(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export const CHECK_IN_MOOD_IDS = ["bright", "steady", "calm", "heavy", "low"] as const;
export type CheckInMood = typeof CHECK_IN_MOOD_IDS[number];
export type DailyCheckIn = { day: string; mood: CheckInMood; timeZone: string; createdAt: string; updatedAt: string };
export type CheckInsResponse = { days: DailyCheckIn[]; today: string; stage: TreeStage; acknowledgedStage: number; pendingStage: 2 | 3 | null };
