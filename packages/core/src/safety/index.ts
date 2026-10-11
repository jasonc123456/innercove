import type {
  OutputScreenReason,
  OutputScreenResult,
  SafetyAssessment,
  SafetyRepliesConfig,
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
  SafetyRepliesConfig,
  SafetyTier,
} from "./types.js";

const OUTPUT_SCREEN_PATTERNS: ReadonlyArray<{
  reason: OutputScreenReason;
  expression: RegExp;
}> = [
  {
    reason: "method_detail",
    expression:
      /\b(?:how to|ways? to|steps? (?:to|for)|instructions? (?:to|for)|best way to)[^.?!]{0,120}\b(?:suicide|kill yourself|self[- ]?harm|overdose|end (?:your|my) life|die)\b/i,
  },
  {
    reason: "method_detail",
    expression:
      /\b(?:take|swallow|mix|use|obtain)[^.?!]{0,100}\b(?:pills|tablets|medication|medicine|rope|weapon|blade|alcohol)\b[^.?!]{0,100}\b(?:suicide|kill yourself|self[- ]?harm|overdose|end (?:your|my) life|die)\b/i,
  },
  {
    reason: "diagnostic_language",
    expression:
      /\b(?:you (?:have|are)|this (?:is|means you have))\s+(?:an? )?(?:clinical )?(?:depression|anxiety disorder|bipolar disorder|ptsd|post-traumatic stress disorder|borderline personality disorder|schizophrenia)\b/i,
  },
  {
    reason: "unsupported_clinical_certainty",
    expression:
      /\b(?:you are|this is|this means|clearly)\s+(?:experiencing|showing signs of|suffering from)\s+(?:an? )?(?:clinical )?(?:mental illness|disorder|trauma response|psychological condition)\b/i,
  },
  {
    reason: "medical_recommendation",
    expression:
      /\b(?:stop|start|skip|double|increase|decrease|change)\s+(?:taking\s+)?(?:your\s+)?(?:medication|medications|meds|dose|dosage|prescription)\b/i,
  },
  {
    reason: "fabricated_emergency_action",
    expression:
      /\b(?:i|we|someone)\s+(?:have|has)\s+(?:called|contacted|notified|alerted)\s+(?:911|emergency services|a clinician|your (?:doctor|therapist)|the police)\b/i,
  },
  {
    reason: "professional_impersonation",
    expression:
      /\b(?:i am|i'm)\s+(?:a |your )?(?:licensed )?(?:therapist|psychologist|psychiatrist|doctor|clinician|emergency service)\b/i,
  },
  {
    reason: "dependency_language",
    expression:
      /\b(?:i(?:'m| am) (?:the )?only one who (?:understands|can help) you|you (?:only )?need me|don't (?:need|talk to) anyone else)\b/i,
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
    ...(primaryRule ? { category: primaryRule.category } : {}),
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

/**
 * Gets the human-reviewed reply for a tier-2 assessment. The fallback is
 * mandatory so a new rule category can never cause model text to be released.
 */
export function getReviewedTier2Reply(
  assessment: SafetyAssessment,
  config: SafetyRepliesConfig,
): string {
  if (assessment.tier !== 2) {
    throw new Error("Reviewed replies are only used for tier-2 assessments.");
  }

  const reply =
    (assessment.category && config.replies[assessment.category]) ||
    config.replies.fallback;

  if (!reply) {
    throw new Error("Safety replies configuration must provide a fallback reply.");
  }

  return reply;
}
