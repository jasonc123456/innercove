/**
 * D49: InnerCove writes its own memories from what the user says in saved chats.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildApp } from "../app.js";
import { FakeProvider, type ChatMessage } from "../inference/index.js";
import { DatabaseStore } from "../store/db.js";
import { signedIn } from "../testing/signed-in.js";
import { InMemoryChatStore } from "./in-memory-store.js";
import { NOTE_WRITER_PROMPT, parseNotes, similar, writeNotes } from "./remember.js";
import { loadSafetyConfigs, rulesSafety } from "./rules-safety.js";
import { noSafety } from "./safety.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const isNoteWriter = (messages: ChatMessage[]) => messages[0]?.content === NOTE_WRITER_PROMPT;

/** Chat replies normally; answers the note writer with `notes` (raw model text). */
function provider(notes: string) {
  return new FakeProvider({ reply: (messages) => (isNoteWriter(messages) ? [notes] : ["Okay. ", "Tell me more."]) });
}

function parse(body: string) {
  return body.split("\n\n").filter(Boolean)
    .map((b) => ({ name: /^event: (.+)$/m.exec(b)?.[1], data: JSON.parse(/^data: (.+)$/m.exec(b)?.[1] ?? "null") }));
}

async function setup(fake: FakeProvider, opts: { store?: InMemoryChatStore; rememberNotes?: boolean; safety?: boolean } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "innercove-remember-"));
  const database = new DatabaseStore(path.join(dir, "test.db"));
  cleanups.push(async () => { await database.shutdown(); rmSync(dir, { recursive: true, force: true }); });
  await database.setup("fixture-only-passphrase");
  const app = await buildApp({
    sessionGuard: signedIn, provider: fake, safety: opts.safety ? rulesSafety(loadSafetyConfigs()) : noSafety,
    systemPrompt: "SYSTEM", stats: { lastReply: null }, database, rememberNotes: opts.rememberNotes ?? true,
    ...(opts.store ? { store: opts.store } : {}),
  }, false);
  cleanups.unshift(async () => { await app.close(); });
  const send = async (url: "/api/chat" | "/api/infer", message: string, conversationId: string | null = null) => {
    const payload = url === "/api/chat"
      ? { conversationId, message, useMemories: true, pinnedMemoryIds: [] }
      : { history: [], message, useMemories: true };
    return parse((await app.inject({ method: "POST", url, payload })).body);
  };
  return { app, send };
}

describe("note writer (D49)", () => {
  it("parses only a JSON array of short strings", () => {
    expect(parseNotes('Sure! ["Has a biology exam on Friday", 3, "ok"]')).toEqual(["Has a biology exam on Friday"]);
    expect(parseNotes("I don't think so.")).toEqual([]);
    expect(parseNotes("[not json]")).toEqual([]);
    expect(parseNotes(`["${"x".repeat(200)}"]`)).toEqual([]);
  });

  it("treats reworded notes as duplicates", () => {
    expect(similar("Has a biology exam on Friday", "Has a biology exam Friday")).toBe(true);
    expect(similar("Has a biology exam on Friday", "Finds lake walks calming")).toBe(false);
  });

  it("drops clinical notes, crisis notes and anything the user already excluded", async () => {
    const notes = await writeNotes({
      provider: provider('["Has depression", "Takes sertraline", "Thinks about suicide", "Has a biology exam on Friday", "Plays guitar"]'),
      safety: rulesSafety(loadSafetyConfigs()),
      message: "fixture",
      existing: [{ content: "Plays guitar in a band", accessLevel: "private" }],
    });
    expect(notes).toEqual(["Has a biology exam on Friday"]);
  });

  it("never shows the model a memory the user excluded", async () => {
    const fake = provider("[]");
    await writeNotes({
      provider: fake, safety: noSafety, message: "fixture",
      existing: [{ content: "EXCLUDED-CANARY", accessLevel: "private" }, { content: "Shared note", accessLevel: "ai_eligible" }],
    });
    const prompt = JSON.stringify(fake.prompts.at(-1));
    expect(prompt).not.toContain("EXCLUDED-CANARY");
    expect(prompt).toContain("Shared note");
  });

  it("a saved chat writes notes linked to the user message and sends `remembered` before `done`", async () => {
    const store = new InMemoryChatStore();
    const { send } = await setup(provider('["Has a biology exam on Friday"]'), { store });
    const events = await send("/api/chat", "My biology exam is on Friday");
    const names = events.map((e) => e.name);
    expect(names.indexOf("remembered")).toBeLessThan(names.indexOf("done"));
    const items = events.find((e) => e.name === "remembered")!.data.items;
    expect(items).toMatchObject([{ content: "Has a biology exam on Friday" }]);
    const saved = store.memories.get(items[0].id)!;
    expect(saved).toMatchObject({ origin: "ai_proposal", status: "approved", accessLevel: "ai_eligible" });
    const userMessageId = events.find((e) => e.name === "meta")!.data.userMessageId;
    expect(saved.provenance).toMatchObject([{ sourceType: "message", sourceId: userMessageId }]);

    // The same fact again adds nothing.
    const again = await send("/api/chat", "Biology exam Friday, still nervous");
    expect(again.some((e) => e.name === "remembered")).toBe(false);
  });

  it("temporary chats, crisis turns and the option being off write nothing", async () => {
    const store = new InMemoryChatStore();
    const { send } = await setup(provider('["Has a biology exam on Friday"]'), { store, safety: true });
    expect((await send("/api/infer", "My biology exam is on Friday")).some((e) => e.name === "remembered")).toBe(false);
    expect((await send("/api/chat", "I don't see the point of waking up tomorrow")).some((e) => e.name === "remembered")).toBe(false);
    expect(store.memories.size).toBe(0);

    const off = await setup(provider('["Has a biology exam on Friday"]'), { store, rememberNotes: false });
    expect((await off.send("/api/chat", "My biology exam is on Friday")).some((e) => e.name === "remembered")).toBe(false);
    expect(store.memories.size).toBe(0);
  });

  it("the SQL store saves approved AI memories the next turn uses, and deleting the chat makes them private (D16)", async () => {
    const { app, send } = await setup(provider('["Has a biology exam on Friday"]'));
    const first = await send("/api/chat", "My biology exam is on Friday");
    const [item] = first.find((e) => e.name === "remembered")!.data.items;
    const memory = (await app.inject(`/api/memories/${item.id}`)).json();
    expect(memory).toMatchObject({ origin: "ai_proposal", status: "approved", accessLevel: "ai_eligible" });

    const next = await send("/api/chat", "Any tips for studying?");
    expect(next.find((e) => e.name === "context")!.data.sources.map((s: { id: string }) => s.id)).toContain(item.id);

    const conversationId = first.find((e) => e.name === "meta")!.data.conversationId;
    await app.inject({ method: "DELETE", url: `/api/conversations/${conversationId}` });
    expect((await app.inject(`/api/memories/${item.id}`)).json().accessLevel).toBe("private");
  });
});
