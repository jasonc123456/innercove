import type { ChatTone, SafetyTier } from "@innercove/core";

/**
 * One reviewed style line per tone, added after the system prompt. "warm" is the prompt as
 * evaluated (v4.2), so it adds nothing. Each line defers to the safety guidance above it.
 */
export const TONE_LINES: Record<ChatTone, string | null> = {
  warm: null,
  calm:
    "Your speaking style for this chat, picked by the user in the app: calm and brief. Use short, plain sentences, three or four at most, " +
    "ask at most one gentle question, and skip exclamation marks. This is how you sound, not how they feel.",
  upbeat:
    "Your speaking style for this chat, picked by the user in the app: light, encouraging energy that points out what is going well. " +
    "This is how you sound, not how they feel: never say or assume they are in a good mood. If something is hard for them, slow down and be gentle first.",
};

const DEFERS = "Everything above about safety, honesty and what you never do still applies and comes first.";

/** The system prompt with the tone's line, or unchanged for "warm" and for any turn showing risk. */
export function withTone(systemPrompt: string, tone: ChatTone | undefined, tier: SafetyTier): string {
  const line = tone ? TONE_LINES[tone] : null;
  if (!line || tier !== 0) return systemPrompt;
  return `${systemPrompt}\n\n${line} ${DEFERS}`;
}
