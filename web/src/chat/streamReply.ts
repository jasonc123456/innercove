import { mockReplyChunks } from "./mockStream";

/**
 * The only seam for Role A's chat endpoint.
 * This calls the local mock. It does not speak HTTP and does not
 * define a request or event schema. Replace this body when /api/chat exists.
 */
export async function streamAssistantReply(
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  for await (const chunk of mockReplyChunks(signal)) {
    if (signal?.aborted) {
      return;
    }
    onDelta(chunk);
  }
}
