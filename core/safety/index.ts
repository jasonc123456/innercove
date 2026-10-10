import type {
  OutputScreenReason,
  OutputScreenResult,
  SafetyAssessment,
  SafetyRule,
  SafetyRulesConfig,
} from "./types.js";

export type {
  OutputScreenReason,
  OutputScreenResult,
  SafetyAssessment,
  SafetyCategory,
  SafetyRule,
  SafetyRulesConfig,
  SafetyTier,
} from "./types.js";

const OUTPUT_SCREEN_PATTERNS: ReadonlyArray<{
  reason: OutputScreenReason;
  expression: RegExp;
}> = [
  {
    reason: "method_detail",
    expression:
      /\b(?:how to|ways? to|steps? (?:to|for)|instructions? (?:to|for)|best way to)[^.?!]{0,120}\b(?:suicide|kill yourself|self[- ]?harm|overdose)\b/i,
  },
  {
    reason: "method_detail",
    expression:
      /\b(?:take|swallow|mix|use|obtain)[^.?!]{0,100}\b(?:pills|tablets|medication|medicine|rope|weapon|blade)\b[^.?!]{0,100}\b(?:suicide|kill yourself|self[- ]?harm|overdose)\b/i,
  },
  {
    reason: "diagnostic_language",
    expression:
      /\b(?:you (?:have|are)|this (?:is|means you have))\s+(?:clinical )?(?:depression|anxiety disorder|bipolar disorder|ptsd|post-traumatic stress disorder|borderline personality disorder|schizophrenia)\b/i,
  },
];

const SAFE_OUTPUT_REPLACEMENT =
  "I want to respond safely. If you may be in immediate danger, please call 911 now. You can also call, text, or chat 988 in the US for immediate crisis support.";

function matchesAny(text: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => new RegExp(pattern, "i").test(text));
}

function ruleMatches(text: string, rule: SafetyRule): boolean {
  if (!matchesAny(text, rule.patterns)) {
    return false;
  }

  return !rule.excludePatterns || !matchesAny(text, rule.excludePatterns);
}

/**
 * Deterministically classifies a user message. The caller supplies the JSON
 * configuration so server and future mobile clients use the same rules.
 */
export function assessUserText(
  text: string,
  config: SafetyRulesConfig,
): SafetyAssessment {
  const matchedRules = config.rules.filter((rule) => ruleMatches(text, rule));

  if (matchedRules.length === 0) {
    return { tier: 0, matchedRuleIds: [] };
  }

  const highestTier = Math.max(...matchedRules.map((rule) => rule.tier)) as 1 | 2;
  const primaryRule = matchedRules.find((rule) => rule.tier === highestTier);

  return {
    tier: highestTier,
    category: primaryRule?.category,
    matchedRuleIds: matchedRules.map((rule) => rule.id),
  };
}

/**
 * Rejects a model reply containing actionable self-harm instructions or a
 * diagnosis. Never send the original text when `allowed` is false.
 */
export function screenAssistantOutput(text: string): OutputScreenResult {
  const reasons = OUTPUT_SCREEN_PATTERNS.filter(({ expression }) =>
    expression.test(text),
  ).map(({ reason }) => reason);

  return reasons.length === 0
    ? { allowed: true, reasons: [] }
    : {
        allowed: false,
        reasons: [...new Set(reasons)],
        replacementText: SAFE_OUTPUT_REPLACEMENT,
      };
}
