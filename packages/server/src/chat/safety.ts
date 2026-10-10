import type { SafetyTier } from "@innercove/core";

export interface Assessment {
  tier: SafetyTier;
  category?: string;
}

export interface ScreenResult {
  allowed: boolean;
  reasons: string[];
  replacementText?: string;
}

/**
 * The seam between the chat pipeline (A) and the safety engine (D, `core/safety`).
 * Shapes match D's `assessUserText`, `screenAssistantOutput` and `getReviewedTier2Reply`.
 */
export interface SafetyLayer {
  assess(userText: string): Assessment;
  screen(assistantText: string): ScreenResult;
  /** Reviewed static reply for a tier-2 assessment (D32); never model output. */
  tier2Reply(assessment: Assessment): string;
}

export const SAFE_FALLBACK =
  "I want to respond safely. If you may be in immediate danger, please call 911 now. You can also call, text, or chat 988 in the US for immediate crisis support.";

/** Placeholder until D's engine is merged: every message is tier 0 and nothing is screened. Dev only. */
export const noSafety: SafetyLayer = {
  assess: () => ({ tier: 0 }),
  screen: () => ({ allowed: true, reasons: [] }),
  tier2Reply: () => SAFE_FALLBACK,
};

/**
 * Splits streamed text into complete sentences for tier-0 release (D32).
 * A sentence ends at . ! ? or … (plus closing quotes or brackets) followed by
 * whitespace, or at a newline. The remainder waits for more text.
 */
export class SentenceGate {
  private buffer = "";

  push(text: string): string[] {
    this.buffer += text;
    const out: string[] = [];
    const boundary = /[.!?…]+["'”’)\]]*\s+|\n+/g;
    let start = 0;
    for (let m = boundary.exec(this.buffer); m; m = boundary.exec(this.buffer)) {
      out.push(this.buffer.slice(start, m.index + m[0].length));
      start = m.index + m[0].length;
    }
    this.buffer = this.buffer.slice(start);
    return out;
  }

  flush(): string {
    const rest = this.buffer;
    this.buffer = "";
    return rest;
  }
}
