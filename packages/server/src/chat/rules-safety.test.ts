import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseStore } from "../store/db.js";
import {
  runOutputScreenGoldenCases,
  runSafetyGoldenCases,
  type OutputScreenGoldenCase,
  type SafetyGoldenCase,
} from "@innercove/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { FakeProvider } from "../inference/index.js";
import { fromRoot } from "../paths.js";
import { loadSafetyConfigs, rulesSafety } from "./rules-safety.js";
import type { SafetyLayer } from "./safety.js";

const configs = loadSafetyConfigs();
const safety = rulesSafety(configs);
const readJson = <T>(p: string): T => JSON.parse(readFileSync(fromRoot(p), "utf8")) as T;
const safetyCases = readJson<SafetyGoldenCase[]>("tests/safety-cases.json");
const screenCases = readJson<OutputScreenGoldenCase[]>("tests/output-screen-cases.json");
const systemPrompt = readFileSync(fromRoot("config/prompts/system-prompt.txt"), "utf8");

function events(body: string) {
  return body
    .split("\n\n")
    .filter(Boolean)
    .map((block) => ({
      name: /^event: (.+)$/m.exec(block)?.[1],
      data: JSON.parse(/^data: (.+)$/m.exec(block)?.[1] ?? "null"),
    }));
}

async function chat(provider: FakeProvider, message: string, safetyLayer: SafetyLayer = safety) {
  const dir = mkdtempSync(path.join(tmpdir(), "innercove-safety-"));
  const database = new DatabaseStore(path.join(dir, "test.db"));
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  try {
    await database.setup("fixture-only-passphrase");
    app = await buildApp({ database, provider, safety: safetyLayer, systemPrompt: "SYSTEM", stats: { lastReply: null } }, false);
    const res = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { conversationId: null, message, useMemories: false, pinnedMemoryIds: [] },
    });
    return { body: res.body, events: events(res.body) };
  } finally {
    await app?.close(); await database.shutdown();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("D's safety engine (golden sets)", () => {
  it("ships the required non-diagnostic, autonomy-respecting system instructions", () => {
    expect(systemPrompt).toContain("You are not a therapist, doctor or crisis service");
    expect(systemPrompt).toContain("Do not diagnose or label conditions");
    expect(systemPrompt).toContain("one open question");
    expect(systemPrompt).toContain("Do not silently create clinical notes");
    expect(systemPrompt).toContain("Ask permission before suggesting a body-based or grounding technique");
    expect(systemPrompt).toContain("Never suggest you can replace them");
  });

  it("tiers all safety cases as expected", () => {
    expect(runSafetyGoldenCases(safetyCases, configs.rules)).toEqual([]);
  });

  it("screens all output cases as expected", () => {
    expect(runOutputScreenGoldenCases(screenCases)).toEqual([]);
  });

  it("fails closed at startup when the required safety configuration is unavailable", () => {
    expect(() => loadSafetyConfigs("/definitely-missing-innercove-safety-config")).toThrow();
  });
});

describe("/api/chat with D's engine", () => {
  it.each(safetyCases.map((c) => [c.id, c] as const))("%s reports its expected tier", async (_id, c) => {
    const provider = new FakeProvider({ reply: ["I hear you. "] });
    const { events: ev } = await chat(provider, c.text);
    expect(ev[0]).toMatchObject({ name: "meta", data: { tier: c.expectedTier } });
    if (c.expectedTier === 2) {
      expect(provider.prompts).toHaveLength(0);
      expect(ev.find((e) => e.name === "delta")?.data.text).toBe(safety.tier2Reply(safety.assess(c.text)));
    }
  });

  it("a real method detail planted mid-stream never reaches the client", async () => {
    const provider = new FakeProvider({
      reply: ["That sounds really heavy. ", "Here are steps ", "to suicide using pills. ", "Anyway, more text."],
    });
    const { body, events: ev } = await chat(provider, "I had a rough day");
    expect(body).not.toMatch(/steps to suicide/i);
    expect(body).not.toContain("more text");
    expect(ev.map((e) => e.name)).toEqual(["meta", "context", "delta", "replaced", "done"]);
  });

  it("does not call the model if safety assessment fails", async () => {
    const provider = new FakeProvider({ reply: ["This must never be generated."] });
    const brokenSafety: SafetyLayer = {
      assess: () => { throw new Error("safety unavailable"); },
      screen: () => ({ allowed: true, reasons: [] }),
      tier2Reply: () => "unused",
    };
    const { events: ev } = await chat(provider, "ordinary message", brokenSafety);
    expect(provider.prompts).toHaveLength(0);
    expect(ev).toContainEqual({
      name: "error",
      data: { code: "INTERNAL_ERROR", message: expect.any(String) },
    });
  });
});
