import { FakeProvider } from "./fake.js";
import { LMStudioProvider } from "./lmstudio.js";
import type { InferenceProvider } from "./provider.js";

export * from "./provider.js";
export { FakeProvider } from "./fake.js";
export { LMStudioProvider } from "./lmstudio.js";
export { ReasoningStripper, stripReasoning } from "./strip-reasoning.js";

export interface InferenceEnv {
  INFERENCE_PROVIDER?: string;
  LOCAL_AI_BASE_URL?: string;
  LOCAL_AI_API_KEY?: string;
  LOCAL_AI_MODEL?: string;
}

/** Switching to the fake provider is an environment change only (Phase 1 acceptance). */
export function createProvider(env: InferenceEnv): InferenceProvider {
  const kind = env.INFERENCE_PROVIDER ?? "lmstudio";
  if (kind === "fake") return new FakeProvider({ delayMs: 40 });
  if (kind !== "lmstudio") throw new Error(`Unknown INFERENCE_PROVIDER: ${kind}`);
  if (!env.LOCAL_AI_API_KEY) throw new Error("LOCAL_AI_API_KEY is required for the lmstudio provider");
  return new LMStudioProvider({
    baseUrl: env.LOCAL_AI_BASE_URL ?? "http://127.0.0.1:1234/v1",
    apiKey: env.LOCAL_AI_API_KEY,
    modelId: env.LOCAL_AI_MODEL ?? "qwen/qwen3.8-27b",
  });
}
