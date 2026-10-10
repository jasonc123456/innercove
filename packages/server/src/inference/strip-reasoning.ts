const BLOCKS = [
  { open: "<think>", close: "</think>" },
  { open: '<details type="reasoning"', close: "</details>" },
] as const;

const STRAY_CLOSE = "</think>";

/**
 * Removes reasoning blocks from streamed model text (D13). Tags may be split
 * across chunks, so a tail that could be the start of a tag is held back until
 * the next chunk decides it. An unterminated block is dropped at the end.
 */
export class ReasoningStripper {
  private buffer = "";
  private closeTag: string | null = null;
  private started = false;

  push(chunk: string): string {
    this.buffer += chunk;
    let out = "";
    for (;;) {
      if (this.closeTag) {
        const end = this.buffer.indexOf(this.closeTag);
        if (end === -1) {
          this.buffer = this.buffer.slice(Math.max(0, this.buffer.length - (this.closeTag.length - 1)));
          return this.emit(out);
        }
        this.buffer = this.buffer.slice(end + this.closeTag.length);
        this.closeTag = null;
        continue;
      }
      const next = this.nextTag();
      if (!next) {
        const keep = partialTagLength(this.buffer);
        out += this.buffer.slice(0, this.buffer.length - keep);
        this.buffer = this.buffer.slice(this.buffer.length - keep);
        return this.emit(out);
      }
      out += this.buffer.slice(0, next.index);
      this.buffer = this.buffer.slice(next.index + next.tag.length);
      this.closeTag = next.close;
    }
  }

  /** Call once the stream ends; returns any held-back visible text. */
  end(): string {
    const rest = this.closeTag ? "" : this.buffer;
    this.buffer = "";
    this.closeTag = null;
    return this.emit(rest);
  }

  private nextTag(): { index: number; tag: string; close: string | null } | null {
    let best: { index: number; tag: string; close: string | null } | null = null;
    for (const { open, close } of BLOCKS) {
      const index = this.buffer.indexOf(open);
      if (index !== -1 && (!best || index < best.index)) best = { index, tag: open, close };
    }
    const stray = this.buffer.indexOf(STRAY_CLOSE);
    if (stray !== -1 && (!best || stray < best.index)) best = { index: stray, tag: STRAY_CLOSE, close: null };
    return best;
  }

  private emit(text: string): string {
    if (!this.started) {
      text = text.replace(/^\s+/, "");
      if (text) this.started = true;
    }
    return text;
  }
}

/** Length of the longest buffer suffix that is a proper prefix of an opening or stray closing tag. */
function partialTagLength(buffer: string): number {
  const tags = [...BLOCKS.map((b) => b.open), STRAY_CLOSE];
  let longest = 0;
  for (const tag of tags) {
    for (let n = Math.min(tag.length - 1, buffer.length); n > longest; n--) {
      if (buffer.endsWith(tag.slice(0, n))) {
        longest = n;
        break;
      }
    }
  }
  return longest;
}

export function stripReasoning(text: string): string {
  const s = new ReasoningStripper();
  return (s.push(text) + s.end()).trim();
}
