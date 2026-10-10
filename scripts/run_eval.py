#!/usr/bin/env python3
"""Phase 0 eval runner (PROJECT_PLAN.md §5 Phase 0). Stdlib only.

Usage: run_eval.py PREP_DIR OUT_DIR [all|companion|safety] [LIMIT]
Env:   LOCAL_AI_BASE_URL (e.g. http://127.0.0.1:1234/v1), LOCAL_AI_API_KEY, LOCAL_AI_MODEL
The key is read from the environment only and never written anywhere.
"""
import csv, json, os, re, sys, time, urllib.error, urllib.request
from pathlib import Path

BASE = os.environ.get("LOCAL_AI_BASE_URL", "http://127.0.0.1:1234/v1").rstrip("/")
KEY = os.environ.get("LOCAL_AI_API_KEY", "")
MODEL = os.environ.get("LOCAL_AI_MODEL", "")
UA = "InnerCove-eval/0.1"
EXTRAS = {"top_k": 20, "reasoning_effort": "none"}
THINK_RE = re.compile(r"<think>.*?(</think>|$)|<details type=\"reasoning\".*?(</details>|$)", re.S)


def stream_chat(messages, extras=True):
    body = {"model": MODEL, "messages": messages, "stream": True, "temperature": 0.7, "top_p": 0.8,
            "presence_penalty": 1.5, "max_tokens": 2048, "stream_options": {"include_usage": True}}
    if extras:
        body.update(EXTRAS)
    req = urllib.request.Request(f"{BASE}/chat/completions", data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {KEY}",
                                          "User-Agent": UA})
    t0 = time.monotonic()
    content, reasoning, ttft, chunks, usage = "", 0, None, 0, None
    with urllib.request.urlopen(req, timeout=600) as resp:
        for raw in resp:
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("data:") or line == "data: [DONE]":
                continue
            ev = json.loads(line[5:])
            usage = ev.get("usage") or usage
            for ch in ev.get("choices") or []:
                d = ch.get("delta") or {}
                reasoning += len(d.get("reasoning_content") or "") + len(d.get("reasoning") or "")
                if d.get("content"):
                    content += d["content"]
                    chunks += 1
                    if ttft is None and THINK_RE.sub("", content).strip():
                        ttft = time.monotonic() - t0
    total = time.monotonic() - t0
    tokens = (usage or {}).get("completion_tokens") or chunks
    gen_time = max(total - (ttft or 0), 1e-6)
    return {"raw": content, "reasoning_field_chars": reasoning, "ttft_s": round(ttft or total, 2),
            "total_s": round(total, 2), "tok_per_s": round(tokens / gen_time, 1), "tokens_reported": bool(usage)}


def run_case(messages):
    try:
        return stream_chat(messages, True), True
    except urllib.error.HTTPError as e:
        if e.code not in (400, 422, 500):
            raise
        print(f"  HTTP {e.code}; retrying without top_k/reasoning_effort", file=sys.stderr)
        return stream_chat(messages, False), False


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    prep, out = Path(sys.argv[1]), Path(sys.argv[2])
    suite = sys.argv[3] if len(sys.argv) > 3 else "all"
    limit = int(sys.argv[4]) if len(sys.argv) > 4 else None
    if not MODEL:
        sys.exit("Set LOCAL_AI_MODEL")
    system = (prep / "system-prompt.txt").read_text().strip()
    comp = json.loads((prep / "companion-tests.json").read_text())
    safe = json.loads((prep / "safety-tests.json").read_text())
    cases = []
    if suite in ("all", "companion"):
        cases += [("companion", c, system + "\n\n" + comp["context"]) for c in comp["cases"][:limit]]
    if suite in ("all", "safety"):
        cases += [("safety", c, system) for c in safe["cases"][:limit]]
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    with open(out / "raw.jsonl", "w") as f:
        for s, c, sys_prompt in cases:
            r, extras = run_case([{"role": "system", "content": sys_prompt}, {"role": "user", "content": c["message"]}])
            raw = r.pop("raw")
            answer = THINK_RE.sub("", raw).strip()
            row = {"suite": s, "id": c["id"], "message": c["message"], "tier": c.get("tier"),
                   "category": c.get("category"), "focus": c.get("focus"), "model": MODEL, "answer": answer,
                   "reasoning_in_content": bool(THINK_RE.search(raw)), **r, "extras_sent": extras}
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            f.flush()
            rows.append(row)
            print(f"{c['id']}: ttft {row['ttft_s']}s, {row['tok_per_s']} tok/s, reasoning chars {row['reasoning_field_chars']}")
    write_replies(out, rows)
    for name in ("companion-scoring.csv", "safety-scoring.csv"):
        src = prep / name
        if src.exists():
            (out / name.replace("-scoring", "-scored")).write_text(src.read_text())
    print(f"Wrote {len(rows)} cases to {out}")


def write_replies(out, rows):
    lines = [f"# {MODEL} replies, {time.strftime('%Y-%m-%d %H:%M')}", ""]
    for r in rows:
        title = r["focus"] or f"{r['category']}, expected tier {r['tier']}"
        lines += [f"## {r['id']}: {title}", "", f"**User:** {r['message']}", "", "**Reply:**", ""]
        lines += ["> " + l for l in r["answer"].splitlines()] + [""]
        lines += [f"_TTFT {r['ttft_s']} s, {r['tok_per_s']} tok/s_", ""]
    (out / "replies.md").write_text("\n".join(lines))


if __name__ == "__main__":
    main()
