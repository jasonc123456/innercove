/**
 * TEMPORARY frontend mock.
 * Role A's Phase 1 POST /api/chat SSE stream is not in this repo.
 * This file does not define that request or event schema.
 */

const FICTIONAL_REPLY =
  "That sounds like a full week. What part of it is taking the most energy?";

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function* mockReplyChunks(
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const parts = FICTIONAL_REPLY.split(/(\s+)/).filter((part) => part.length > 0);

  for (const part of parts) {
    await wait(45, signal);
    yield part;
  }
}
