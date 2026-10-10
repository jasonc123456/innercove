import { assessUserText, screenAssistantOutput } from "./index.js";
import type {
  OutputScreenReason,
  SafetyRulesConfig,
  SafetyTier,
} from "./types.js";

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

export interface OutputScreenGoldenCase {
  id: string;
  text: string;
  allowed: boolean;
  reasons: OutputScreenReason[];
}

export interface OutputScreenGoldenFailure {
  id: string;
  expectedAllowed: boolean;
  actualAllowed: boolean;
  expectedReasons: OutputScreenReason[];
  actualReasons: OutputScreenReason[];
}

/** Framework-independent output-screen checks for the server test runner. */
export function runOutputScreenGoldenCases(
  cases: readonly OutputScreenGoldenCase[],
): OutputScreenGoldenFailure[] {
  return cases.flatMap((testCase) => {
    const result = screenAssistantOutput(testCase.text);
    const reasonsMatch =
      result.reasons.length === testCase.reasons.length &&
      result.reasons.every((reason) => testCase.reasons.includes(reason));

    return result.allowed === testCase.allowed && reasonsMatch
      ? []
      : [
          {
            id: testCase.id,
            expectedAllowed: testCase.allowed,
            actualAllowed: result.allowed,
            expectedReasons: testCase.reasons,
            actualReasons: result.reasons,
          },
        ];
  });
}
