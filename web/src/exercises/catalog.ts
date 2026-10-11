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
  { id: "breathing478", title: "4-7-8 Breathing", description: "A guided inhale, optional hold, and slow exhale.", duration: "About 20–80 seconds", level: "Go gently", route: "/exercises/breathing", available: true },
  { id: "comfortable-breathing", title: "Comfortable paced breathing", description: "A no-hold, unforced 4-in / 6-out rhythm.", duration: "About 10–40 seconds", level: "Gentle", route: "/exercises/breathing?style=comfortable", available: true },
  { id: "grounding", title: "5-4-3-2-1 sensory grounding", description: "A clinician-reviewed exercise to add next.", duration: "Future feature", level: "Optional", available: false },
  { id: "journaling", title: "Guided journaling", description: "A clinician-reviewed prompt flow to add next.", duration: "Future feature", level: "Optional", available: false },
  { id: "cbt-reflection", title: "Thought reflection", description: "A CBT-informed reflection to add next.", duration: "Future feature", level: "Optional", available: false },
  { id: "body-awareness", title: "Brief body awareness", description: "A clinician-reviewed body-awareness exercise to add next.", duration: "Future feature", level: "Optional", available: false },
];
