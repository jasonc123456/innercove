import { describe, expect, it } from "vitest";
import { LMStudioProvider } from "./lmstudio.js";
import { ModelUnavailableError, type ProviderEvent } from "./provider.js";

function sse(events: object[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
}

function fakeFetch(handler: (url: string, body: any) => Response) {
  const calls: { url: string; body: any; headers: Record<string, string> }[] = [];
  const fn = (async (url: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body, headers: init.headers as Record<string, string> });
    return handler(url, body);
  }) as typeof fetch;
  return { fn, calls };
}

async function collect(it: AsyncIterable<ProviderEvent>) {
  const out: ProviderEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

const delta = (content: object) => ({ choices: [{ delta: content }] });

describe("LMStudioProvider", () => {
  it("sends the D13 request and yields only visible text", async () => {
    const { fn, calls } = fakeFetch(() =>
      new Response(
        sse([
          delta({ reasoning_content: "hidden" }),
          delta({ content: "<thi" }),
          delta({ content: "nk>x</think>Hel" }),
          delta({ content: "lo" }),
          { choices: [], usage: { completion_tokens: 2 } },
        ]),
      ),
    );
    const p = new LMStudioProvider({ baseUrl: "http://lm/v1/", apiKey: "k", modelId: "m", fetch: fn });
    const events = await collect(p.streamChat([{ role: "user", content: "hi" }]));

    expect(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("")).toBe("Hello");
    expect(events).toContainEqual({ type: "usage", completionTokens: 2 });
    expect(calls[0]!.url).toBe("http://lm/v1/chat/completions");
    expect(calls[0]!.headers.Authorization).toBe("Bearer k");
    expect(calls[0]!.headers["User-Agent"]).toMatch(/^InnerCove\//);
    expect(calls[0]!.body).toMatchObject({
      model: "m",
      stream: true,
      temperature: 0.7,
      top_p: 0.8,
      top_k: 20,
      presence_penalty: 1.5,
      reasoning_effort: "none",
    });
  });

  it("retries without top_k and reasoning_effort after a 400", async () => {
    const { fn, calls } = fakeFetch((_u, body) =>
      body.top_k ? new Response("bad", { status: 400 }) : new Response(sse([delta({ content: "ok" })])),
    );
    const p = new LMStudioProvider({ baseUrl: "http://lm/v1", apiKey: "k", modelId: "m", fetch: fn });
    const events = await collect(p.streamChat([{ role: "user", content: "hi" }]));
    expect(events).toContainEqual({ type: "text", text: "ok" });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.body.reasoning_effort).toBeUndefined();
  });

  it("throws ModelUnavailableError on 401 or a network failure", async () => {
    const denied = new LMStudioProvider({
      baseUrl: "http://lm/v1",
      apiKey: "bad",
      modelId: "m",
      fetch: fakeFetch(() => new Response("no", { status: 401 })).fn,
    });
    await expect(collect(denied.streamChat([]))).rejects.toBeInstanceOf(ModelUnavailableError);

    const down = new LMStudioProvider({
      baseUrl: "http://lm/v1",
      apiKey: "k",
      modelId: "m",
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    await expect(collect(down.streamChat([]))).rejects.toBeInstanceOf(ModelUnavailableError);
    expect(await down.health()).toEqual({ modelId: "m", reachable: false });
  });
});
