export type SafetyTier = 0 | 1 | 2;

export type SafetyCategory =
  | "abuse"
  | "explicit_self_harm"
  | "eating_concern"
  | "harm_to_others"
  | "method_seeking"
  | "overdose"
  | "passive_self_harm"
  | "self_harm_ideation"
  | "third_party_concern";

export interface SafetyRule {
  id: string;
  tier: Exclude<SafetyTier, 0>;
  category: SafetyCategory;
  patterns: string[];
  excludePatterns?: string[];
}

export interface SafetyRulesConfig {
  version: number;
  rules: SafetyRule[];
}

export interface SafetyAssessment {
  tier: SafetyTier;
  category?: SafetyCategory;
  matchedRuleIds: string[];
}

export type OutputScreenReason = "diagnostic_language" | "method_detail";

export interface OutputScreenResult {
  allowed: boolean;
  reasons: OutputScreenReason[];
  /** A safe generic response for the caller to use instead of blocked model text. */
  replacementText?: string;
}
