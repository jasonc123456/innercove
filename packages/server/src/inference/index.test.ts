import { describe, expect, it } from "vitest";
import { createProvider, FakeProvider, LMStudioProvider } from "./index.js";

describe("createProvider", () => {
  it("defaults to LM Studio", () => {
    expect(createProvider({ LOCAL_AI_API_KEY: "test-key" })).toBeInstanceOf(LMStudioProvider);
  });

  it("refuses the fake provider outside automated tests", () => {
    expect(() => createProvider({ INFERENCE_PROVIDER: "fake" })).toThrow(/automated tests only/);
    expect(() => createProvider({ INFERENCE_PROVIDER: "fake", NODE_ENV: "development" })).toThrow(/automated tests only/);
  });

  it("allows the fake provider with NODE_ENV=test", () => {
    expect(createProvider({ INFERENCE_PROVIDER: "fake", NODE_ENV: "test" })).toBeInstanceOf(FakeProvider);
  });
});
