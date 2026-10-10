import { assessUserText } from "./index.js";
import type { SafetyRulesConfig, SafetyTier } from "./types.js";

export interface SafetyGoldenCase {
  id: string;
  text: string;
  expectedTier: SafetyTier;
}

export interface GoldenFailure {
  id: string;
  expectedTier: SafetyTier;
  actualTier: SafetyTier;
}

/** Framework-independent helper for the server's test runner. */
export function runSafetyGoldenCases(
  cases: readonly SafetyGoldenCase[],
  config: SafetyRulesConfig,
): GoldenFailure[] {
  return cases.flatMap((testCase) => {
    const actualTier = assessUserText(testCase.text, config).tier;
    return actualTier === testCase.expectedTier
      ? []
      : [{ id: testCase.id, expectedTier: testCase.expectedTier, actualTier }];
  });
}
