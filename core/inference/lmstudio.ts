import {
  ModelUnavailableError,
  type ChatMessage,
  type GenerateOptions,
  type InferenceProvider,
  type ProviderEvent,
  type ProviderHealth,
} from "./provider.js";
import { ReasoningStripper } from "./strip-reasoning.js";

export interface LMStudioOptions {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  fetch?: typeof fetch;
}

/** Sampling per the model card's non-thinking settings (plan §3b); thinking off per D13. */
const SAMPLING = { temperature: 0.7, top_p: 0.8, presence_penalty: 1.5 };
const EXTRAS = { top_k: 20, reasoning_effort: "none" };
const USER_AGENT = "InnerCove/0.1";

export class LMStudioProvider implements InferenceProvider {
  readonly modelId: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetch: typeof fetch;

  constructor(options: LMStudioOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.modelId = options.modelId;
    this.fetch = options.fetch ?? fetch;
  }

  async *streamChat(messages: ChatMessage[], options: GenerateOptions = {}): AsyncGenerator<ProviderEvent> {
    const body = {
      model: this.modelId,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: options.maxTokens ?? 1024,
      ...SAMPLING,
    };
    let res = await this.post({ ...body, ...EXTRAS }, options.signal);
    if ([400, 422, 500].includes(res.status)) {
      await res.body?.cancel();
      res = await this.post(body, options.signal);
    }
    if (!res.ok || !res.body) {
      await res.body?.cancel();
      throw new ModelUnavailableError(`model server returned ${res.status}`, res.status);
    }

    const stripper = new ReasoningStripper();
    const decoder = new TextDecoder();
    let pending = "";
    for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        for (const event of parseLine(line, stripper)) yield event;
      }
    }
    for (const event of parseLine(pending, stripper)) yield event;
    const tail = stripper.end();
    if (tail) yield { type: "text", text: tail };
  }

  async health(): Promise<ProviderHealth> {
    try {
      const res = await this.fetch(`${this.baseUrl}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(2000),
      });
      await res.body?.cancel();
      return { modelId: this.modelId, reachable: res.ok };
    } catch {
      return { modelId: this.modelId, reachable: false };
    }
  }

  private async post(body: object, signal?: AbortSignal): Promise<Response> {
    try {
      return await this.fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ModelUnavailableError("model server unreachable");
    }
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, "User-Agent": USER_AGENT };
  }
}

/** Parses one SSE line. Only `delta.content` is visible text; `reasoning_content`/`reasoning` are dropped. */
function parseLine(line: string, stripper: ReasoningStripper): ProviderEvent[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return [];
  const data = trimmed.slice(5).trim();
  if (data === "[DONE]") return [];
  let payload: {
    choices?: { delta?: { content?: string | null } }[];
    usage?: { completion_tokens?: number } | null;
  };
  try {
    payload = JSON.parse(data);
  } catch {
    return [];
  }
  const events: ProviderEvent[] = [];
  for (const choice of payload.choices ?? []) {
    const content = choice.delta?.content;
    if (content) {
      const text = stripper.push(content);
      if (text) events.push({ type: "text", text });
    }
  }
  if (payload.usage?.completion_tokens) {
    events.push({ type: "usage", completionTokens: payload.usage.completion_tokens });
  }
  return events;
}
