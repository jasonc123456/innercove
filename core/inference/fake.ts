import type {
  ChatMessage,
  GenerateOptions,
  InferenceProvider,
  ProviderEvent,
  ProviderHealth,
} from "./provider.js";

export interface FakeProviderOptions {
  /** Chunks to stream, or a function of the prompt that returns them. */
  reply?: string[] | ((messages: ChatMessage[]) => string[]);
  delayMs?: number;
  reachable?: boolean;
}

const DEFAULT_REPLY = "That sounds like a lot to carry this week. What part of it is weighing on you most?";

/** Deterministic provider for development and tests. Records every prompt it receives. */
export class FakeProvider implements InferenceProvider {
  readonly modelId = "fake";
  readonly prompts: ChatMessage[][] = [];

  constructor(private readonly options: FakeProviderOptions = {}) {}

  async *streamChat(messages: ChatMessage[], options: GenerateOptions = {}): AsyncGenerator<ProviderEvent> {
    this.prompts.push(messages.map((m) => ({ ...m })));
    const { reply, delayMs = 0 } = this.options;
    const chunks = typeof reply === "function" ? reply(messages) : (reply ?? DEFAULT_REPLY.split(/(?<= )/));
    for (const text of chunks) {
      if (delayMs) await sleep(delayMs, options.signal);
      options.signal?.throwIfAborted();
      yield { type: "text", text };
    }
    yield { type: "usage", completionTokens: chunks.length };
  }

  async health(): Promise<ProviderHealth> {
    return { modelId: this.modelId, reachable: this.options.reachable ?? true };
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
