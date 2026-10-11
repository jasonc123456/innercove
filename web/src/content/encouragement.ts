/** Sign-in encouragement copy. Pick a line only when the card opens, never while rendering. */
export const ENCOURAGEMENT = [
  "One small step is enough for today.",
  "Take a breath. Find your own pace.",
  "You don’t have to do it all at once.",
  "Small progress still counts.",
  "Give yourself room to grow.",
  "It’s okay to pause.",
  "Begin again, gently.",
  "Be kind to yourself along the way.",
  "Your pace doesn’t have to match anyone else’s.",
  "Make room for a little joy.",
  "You can be proud of the effort.",
  "Some days, showing up is enough.",
  "Rest is part of the journey.",
  "Let this moment be a fresh start.",
  "You deserve the kindness you give others.",
  "A quiet moment can be enough.",
  "There’s room to learn as you go.",
  "You don’t need every answer right now.",
  "Let today be a little lighter.",
  "You can take the next step when you’re ready.",
] as const;

/** Next index, skipping the line that is open now so two openings never match. */
export function pickEncouragement(previous: number | null) {
  const choices = ENCOURAGEMENT.map((_, index) => index).filter((index) => index !== previous);
  return choices[Math.floor(Math.random() * choices.length)] ?? 0;
}
