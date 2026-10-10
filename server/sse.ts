import type { ServerResponse } from "node:http";
import type { ChatEvents } from "../core/chat/schemas.js";

export type SendEvent = <K extends keyof ChatEvents>(name: K, data: ChatEvents[K]) => void;

/** Opens an SSE response on the raw Node stream and returns a typed event writer. */
export function openSse(res: ServerResponse): SendEvent {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  return (name, data) => {
    if (!res.writableEnded) res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  };
}
