import { describe, expect, it } from "vitest";
import { ReasoningStripper, stripReasoning } from "./strip-reasoning.js";

function streamed(chunks: string[]): string {
  const s = new ReasoningStripper();
  return chunks.map((c) => s.push(c)).join("") + s.end();
}

/** Every way to split `text` into two chunks, plus one character at a time. */
function splits(text: string): string[][] {
  const out = [[...text]];
  for (let i = 1; i < text.length; i++) out.push([text.slice(0, i), text.slice(i)]);
  return out;
}

describe("ReasoningStripper", () => {
  it("passes plain text through", () => {
    expect(streamed(["Hello ", "there."])).toBe("Hello there.");
  });

  it("removes a <think> block and leading whitespace", () => {
    expect(stripReasoning("<think>plan the reply</think>\n\nHi.")).toBe("Hi.");
  });

  it("removes a <details type=\"reasoning\"> block", () => {
    expect(stripReasoning('<details type="reasoning" done="true">\n<summary>Thought</summary>x\n</details>Answer')).toBe("Answer");
  });

  it("handles tags split at every position across chunks", () => {
    const text = "<think>secret plan</think>Visible <think>more</think>answer.";
    for (const chunks of splits(text)) expect(streamed(chunks)).toBe("Visible answer.");
  });

  it("never emits reasoning even when it arrives one character at a time", () => {
    const s = new ReasoningStripper();
    let out = "";
    for (const ch of "<think>SECRET</think>ok") out += s.push(ch);
    out += s.end();
    expect(out).toBe("ok");
    expect(out).not.toContain("SECRET");
  });

  it("drops an unterminated reasoning block", () => {
    expect(streamed(["Start. ", "<think>never closed"])).toBe("Start. ");
  });

  it("removes a stray closing tag", () => {
    expect(stripReasoning("</think>Answer")).toBe("Answer");
  });

  it("keeps text that only looks like the start of a tag", () => {
    expect(streamed(["a <thin", "g> b"])).toBe("a <thing> b");
    expect(streamed(["3 <", " 4"])).toBe("3 < 4");
  });
});
