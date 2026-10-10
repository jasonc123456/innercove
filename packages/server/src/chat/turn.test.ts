import { describe, expect, it } from "vitest";
import { FakeProvider } from "../inference/index.js";
import type { ChatEvents } from "@innercove/core";
import { SentenceGate, type SafetyLayer } from "./safety.js";
import { REVIEWED_REPLY_MODEL_ID, runTurn } from "./turn.js";

const PLANTED = "PLANTED-METHOD-DETAIL";

/** Test double shaped like D's engine: "crisis" is tier 1, "emergency" tier 2, PLANTED is blocked. */
const safety: SafetyLayer = {
  assess: (text) =>
    /emergency/.test(text)
      ? { tier: 2, category: "overdose", matchedRuleIds: ["t"] }
      : /crisis/.test(text)
        ? { tier: 1, matchedRuleIds: ["t"] }
        : { tier: 0, matchedRuleIds: [] },
  screen: (text) =>
    text.includes(PLANTED)
      ? { allowed: false, reasons: ["method_detail"], replacementText: "SAFE REPLACEMENT" }
      : { allowed: true, reasons: [] },
  tier2Reply: (a) => `Reviewed reply for ${a.category}`,
};

async function turn(reply: string[], message = "hello") {
  const provider = new FakeProvider({ reply });
  const events: { name: keyof ChatEvents; data: any }[] = [];
  const blocks: string[][] = [];
  await runTurn({
    provider,
    safety,
    systemPrompt: "SYSTEM",
    history: [],
    message,
    signal: new AbortController().signal,
    send: (name, data) => events.push({ name, data }),
    onScreenBlock: (_tier, reasons) => blocks.push([...reasons]),
  });
  const wire = JSON.stringify(events);
  return { provider, events, blocks, wire, names: events.map((e) => e.name) };
}

describe("SentenceGate", () => {
  it("releases only complete sentences", () => {
    const g = new SentenceGate();
    expect(g.push("Hello there")).toEqual([]);
    expect(g.push(". How are")).toEqual(["Hello there. "]);
    expect(g.push(" you?\nFine")).toEqual(["How are you?\n"]);
    expect(g.flush()).toBe("Fine");
  });
});

describe("runTurn screen-before-display (D32)", () => {
  it("tier 0: a planted method detail mid-stream never reaches the client", async () => {
    const { events, blocks, wire, names } = await turn([
      "That sounds really hard. ",
      "Here is ",
      "PLANTED-",
      "METHOD-DETAIL in a sentence. ",
      "Text after the block.",
    ]);
    expect(wire).not.toContain(PLANTED);
    expect(wire).not.toContain("PLANTED");
    expect(wire).not.toContain("Text after the block");
    expect(names).toEqual(["meta", "context", "delta", "replaced", "done"]);
    expect(events[2]!.data.text).toBe("That sounds really hard. ");
    expect(events[3]!.data).toEqual({ text: "SAFE REPLACEMENT", reason: "screen" });
    expect(blocks).toEqual([["method_detail"]]);
  });

  it("tier 0: catches a detail split across two sentences' worth of chunks", async () => {
    const { wire } = await turn(["Okay. PLANTED-METHOD", "-DETAIL"]);
    expect(wire).not.toContain(PLANTED);
  });

  it("tier 1: generates in full, screens, then sends one block", async () => {
    const { events, names } = await turn(["I hear ", "you. ", "You matter."], "I'm in crisis");
    expect(events[0]!.data.tier).toBe(1);
    expect(names).toEqual(["meta", "context", "delta", "done"]);
    expect(events[2]!.data.text).toBe("I hear you. You matter.");
  });

  it("tier 1: a blocked reply sends only the replacement", async () => {
    const { wire, names } = await turn(["Sure. ", PLANTED], "crisis");
    expect(wire).not.toContain(PLANTED);
    expect(wire).not.toContain("Sure.");
    expect(names).toEqual(["meta", "context", "replaced", "done"]);
  });

  it("tier 2: sends the reviewed static reply with no model call", async () => {
    const { provider, events, names } = await turn(["model text"], "emergency");
    expect(provider.prompts).toHaveLength(0);
    expect(names).toEqual(["meta", "context", "delta", "done"]);
    expect(events[2]!.data.text).toBe("Reviewed reply for overdose");
    expect(events[3]!.data.modelId).toBe(REVIEWED_REPLY_MODEL_ID);
  });
});
