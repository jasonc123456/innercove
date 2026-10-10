import { readFileSync } from "node:fs";
import {
  assessUserText,
  getReviewedTier2Reply,
  screenAssistantOutput,
  type SafetyRepliesConfig,
  type SafetyRulesConfig,
} from "@innercove/core";
import { fromRoot } from "../paths.js";
import type { SafetyLayer } from "./safety.js";

export interface SafetyConfigs {
  rules: SafetyRulesConfig;
  replies: SafetyRepliesConfig;
}

/** Reads D's config from `config/`. Throws if missing: the server never starts without safety (D22). */
export function loadSafetyConfigs(dir = fromRoot("config")): SafetyConfigs {
  const read = <T>(name: string): T => JSON.parse(readFileSync(`${dir}/${name}`, "utf8")) as T;
  return {
    rules: read<SafetyRulesConfig>("safety-rules.json"),
    replies: read<SafetyRepliesConfig>("safety-replies.us.json"),
  };
}

/** D's deterministic engine (`@innercove/core` safety) behind the pipeline's seam. */
export function rulesSafety({ rules, replies }: SafetyConfigs): SafetyLayer {
  return {
    assess: (text) => assessUserText(text, rules),
    screen: (text) => screenAssistantOutput(text),
    tier2Reply: (assessment) => getReviewedTier2Reply(assessment, replies),
  };
}
