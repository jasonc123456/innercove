export type ExerciseCardData = {
  id: string;
  title: string;
  description: string;
  duration: string;
  level: string;
  route?: string;
  available: boolean;
};

export const EXERCISES: readonly ExerciseCardData[] = [
  { id: "breathing478", title: "Guided breathing", description: "Slow down and focus on your breath at your own pace.", duration: "About 20–80 seconds", level: "Available now", route: "/exercises/breathing", available: true },
  { id: "grounding", title: "Grounding", description: "Reconnect with the present moment.", duration: "Planned", level: "Planned", available: false },
  { id: "journaling", title: "Guided journaling", description: "Put your thoughts into words.", duration: "Planned", level: "Planned", available: false },
  { id: "cbt-reflection", title: "Thought reflection", description: "Explore thoughts and alternative perspectives.", duration: "Planned", level: "Planned", available: false },
];
