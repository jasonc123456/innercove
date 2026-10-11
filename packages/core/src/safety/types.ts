export type SafetyTier = 0 | 1 | 2;

export type SafetyCategory =
  | "abuse"
  | "explicit_self_harm"
  | "eating_concern"
  | "harm_to_others"
  | "medical_concern"
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

export type OutputScreenReason =
  | "dependency_language"
  | "diagnostic_language"
  | "fabricated_emergency_action"
  | "medical_recommendation"
  | "method_detail"
  | "professional_impersonation"
  | "unsupported_clinical_certainty";

export interface OutputScreenResult {
  allowed: boolean;
  reasons: OutputScreenReason[];
  /** A safe generic response for the caller to use instead of blocked model text. */
  replacementText?: string;
}

export interface SafetyRepliesConfig {
  version: number;
  replies: Record<string, string>;
}
