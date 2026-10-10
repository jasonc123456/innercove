export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface GenerateOptions {
  signal?: AbortSignal;
  maxTokens?: number;
}

/** Normalized provider output: visible answer text only, never reasoning. */
export type ProviderEvent =
  | { type: "text"; text: string }
  | { type: "usage"; completionTokens: number };

export interface ProviderHealth {
  modelId: string;
  reachable: boolean;
}

export interface InferenceProvider {
  readonly modelId: string;
  streamChat(messages: ChatMessage[], options?: GenerateOptions): AsyncIterable<ProviderEvent>;
  health(): Promise<ProviderHealth>;
}

/** Thrown when the model server can't be reached or rejects the request. Maps to 503 MODEL_UNAVAILABLE. */
export class ModelUnavailableError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ModelUnavailableError";
  }
}
