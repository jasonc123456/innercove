import type { CheckInMood } from "../../../packages/core/src/tree-growth";
export const CHECK_IN_MOODS = [
  { id: "bright", label: "Bright", emoji: "☀️", color: "#f6b84b", shade: "#fff0c9", note: "A warm, hopeful day." },
  { id: "steady", label: "Steady", emoji: "🌿", color: "#55a66a", shade: "#daf1dc", note: "Grounded and getting through it." },
  { id: "calm", label: "Calm", emoji: "💧", color: "#54a8bb", shade: "#d7f0f3", note: "A quieter moment." },
  { id: "heavy", label: "Heavy", emoji: "☁️", color: "#8a7ab8", shade: "#e7e1f5", note: "It is okay to move gently today." },
  { id: "low", label: "Low", emoji: "🌙", color: "#ca6d82", shade: "#f8dce3", note: "You do not have to carry it alone." },
] as const satisfies readonly { id: CheckInMood; label: string; emoji: string; color: string; shade: string; note: string }[];
export const moodStyle = (id: CheckInMood) => CHECK_IN_MOODS.find(mood => mood.id === id)!;
