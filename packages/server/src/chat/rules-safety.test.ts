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
import { carriedTier } from "./turn.js";
import { signedIn } from "../testing/signed-in.js";

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
    app = await buildApp({ sessionGuard: signedIn, database, provider, safety: safetyLayer, systemPrompt: "SYSTEM", stats: { lastReply: null } }, false);
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

describe("carried risk across turns", () => {
  // A team test conversation (2026-10-11): each message alone looked harmless to the old rules.
  const conversation = [
    "I have some depressing thoughts and i feel like i no longer need any of the things i have rn...",
    "i mean... i just want a fresh start maybe in another life?",
  ];

  it("indirect death wishes are tier 1, travel plans and idioms are not", () => {
    for (const text of [...conversation, "I want to go to sleep and not wake up", "sometimes I think about ending it",
      "I've been giving away some of my stuff lately, like books and my guitar. Feels lighter."]) {
      expect(safety.assess(text).tier, text).toBe(1);
    }
    for (const text of ["I won't need my stuff for the trip", "thinking about ending it with my boyfriend", "I need a fresh start this semester",
      "I'm moving out so I gave away my books"]) {
      expect(safety.assess(text).tier, text).toBe(0);
    }
  });

  it("a short follow-up after a risky message keeps the crisis tier, without forcing the static reply", () => {
    expect(safety.assess("do i have to spell it out for you?").tier).toBe(0);
    expect(carriedTier(safety, conversation)).toBe(1);
    expect(carriedTier(safety, [conversation[0]!, "ok", "thanks", "what about exams"])).toBe(0);
    expect(carriedTier(safety, ["I had a good day"])).toBe(0);
  });

  it("/api/infer sends tier 1 for the follow-up when the history holds the risk", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "innercove-carry-"));
    const database = new DatabaseStore(path.join(dir, "test.db"));
    await database.setup("fixture-only-passphrase");
    const app = await buildApp({ sessionGuard: signedIn, database, provider: new FakeProvider(), safety, systemPrompt: "SYSTEM", stats: { lastReply: null } }, false);
    try {
      const history = conversation.flatMap((content) => [{ role: "user", content }, { role: "assistant", content: "I'm here." }]);
      const res = await app.inject({ method: "POST", url: "/api/infer", payload: { history, message: "do i have to spell it out for you?" } });
      expect(events(res.body).find((e) => e.name === "meta")!.data.tier).toBe(1);
      const fresh = await app.inject({ method: "POST", url: "/api/infer", payload: { history: [], message: "do i have to spell it out for you?" } });
      expect(events(fresh.body).find((e) => e.name === "meta")!.data.tier).toBe(0);
    } finally {
      await app.close();
      await database.shutdown();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
