import type { MessageContextRecord, MessageRecord } from "@innercove/core";
import type { ChatMessage } from "../inference/index.js";

export const MAX_HISTORY_EXCHANGES = 20;

/**
 * D33: an earlier exchange (a user message plus the replies that followed it)
 * is left out of the prompt from now on if any of its replies used a source
 * that is no longer eligible (hidden, deleted or revoked). Unknown sources
 * count as ineligible (fail closed). Returns the remaining turns, oldest first,
 * trimmed to the last MAX_HISTORY_EXCHANGES exchanges.
 */
export function filterHistory(
  messages: readonly MessageRecord[],
  contexts: readonly MessageContextRecord[],
  eligible: ReadonlySet<string>,
): { history: ChatMessage[]; excludedCount: number } {
  const sourcesByMessage = new Map<string, string[]>();
  for (const c of contexts) {
    const list = sourcesByMessage.get(c.messageId) ?? [];
    list.push(c.sourceId);
    sourcesByMessage.set(c.messageId, list);
  }

  const exchanges: MessageRecord[][] = [];
  for (const m of [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (m.role === "system") continue;
    if (m.role === "user" || exchanges.length === 0) exchanges.push([m]);
    else exchanges.at(-1)!.push(m);
  }

  let excludedCount = 0;
  const kept = exchanges.filter((exchange) => {
    const tainted = exchange.some((m) => (sourcesByMessage.get(m.id) ?? []).some((id) => !eligible.has(id)));
    if (tainted) excludedCount++;
    return !tainted;
  });

  const history = kept
    .slice(-MAX_HISTORY_EXCHANGES)
    .flat()
    .map((m): ChatMessage => ({ role: m.role as "user" | "assistant", content: m.content }));
  return { history, excludedCount };
}
