#!/usr/bin/env python3
"""Phase 0 checks 1-5 and 7 against LM Studio (PROJECT_PLAN.md §5 Phase 0). Stdlib only.

Usage: smoke-inference.py [--skip-speed]
Env:   same as run_eval.py (LOCAL_AI_BASE_URL, LOCAL_AI_API_KEY, LOCAL_AI_MODEL).
Check 6 (host-network container) is manual:
  sudo docker run --rm --network host -e K="$LOCAL_AI_API_KEY" curlimages/curl \
    -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $K" http://127.0.0.1:1234/v1/models
"""
import json, socket, subprocess, sys, time, urllib.error, urllib.parse, urllib.request, uuid
from pathlib import Path

from run_eval import BASE, KEY, MODEL, THINK_RE, UA, stream_chat

LOG_DIRS = [Path.home() / ".lmstudio", Path.home() / ".cache" / "lm-studio"]
FILLER = "The library opens at nine and closes at six on weekdays. "  # ~13 tokens


def post(body, key=KEY):
    req = urllib.request.Request(f"{BASE}/chat/completions", data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}",
                                          "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.load(r)


def status(path, key):
    req = urllib.request.Request(f"{BASE}{path}", headers={"User-Agent": UA, **({"Authorization": f"Bearer {key}"} if key else {})})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def check(name, ok, detail=""):
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{': ' + detail if detail else ''}")
    return ok


def speed():
    for target in (1000, 8000):
        prompt = FILLER * (target // 13) + "\nIn one sentence, when does the library open?"
        r = stream_chat([{"role": "user", "content": prompt}])
        print(f"[INFO] ~{target // 1000}K prompt: first visible word {r['ttft_s']} s, {r['tok_per_s']} tok/s, total {r['total_s']} s")


def thinking():
    msgs = [{"role": "user", "content": "What is 17 * 23? Answer briefly."}]
    base = {"model": MODEL, "messages": msgs, "max_tokens": 512, "temperature": 0.7}
    for label, extra in (("reasoning_effort none", {"reasoning_effort": "none"}),
                         ("chat_template_kwargs.enable_thinking=false", {"chat_template_kwargs": {"enable_thinking": False}})):
        m = post({**base, **extra})["choices"][0]["message"]
        content = m.get("content") or ""
        rc, rr = len(m.get("reasoning_content") or ""), len(m.get("reasoning") or "")
        check(f"thinking off via {label}", not THINK_RE.search(content) and rc == 0 and rr == 0,
              f"think-in-content={bool(THINK_RE.search(content))}, reasoning_content={rc}, reasoning={rr}, answer={content.strip()[:60]!r}")


def json_schema():
    schema = {"type": "object", "properties": {"mood": {"type": "integer", "minimum": 1, "maximum": 5},
                                               "summary": {"type": "string"}},
              "required": ["mood", "summary"], "additionalProperties": False}
    body = {"model": MODEL, "max_tokens": 300, "reasoning_effort": "none",
            "messages": [{"role": "user", "content": "Rate this day 1-5 and summarise: 'Exam went fine, slept well.'"}],
            "response_format": {"type": "json_schema", "json_schema": {"name": "day", "strict": True, "schema": schema}}}
    text = post(body)["choices"][0]["message"].get("content") or ""
    try:
        obj = json.loads(text)
        ok = isinstance(obj.get("mood"), int) and isinstance(obj.get("summary"), str)
    except ValueError:
        ok = False
    check("response_format json_schema returns valid JSON", ok, text.strip()[:80])


def auth():
    check("request without token gets 401", status("/models", None) == 401, f"got {status('/models', None)}")
    check("request with token lists models", status("/models", KEY) == 200, f"got {status('/models', KEY)}")


def loopback_only():
    port = urllib.parse.urlparse(BASE).port or 80
    out = subprocess.run(["ss", "-ltnH", f"sport = :{port}"], capture_output=True, text=True).stdout.split()
    addrs = [a for a in out if a.endswith(f":{port}")]
    check(f"port {port} bound to loopback only (ss)", bool(addrs) and all(a.startswith(("127.", "[::1]")) for a in addrs), " ".join(addrs))
    ips = subprocess.run(["hostname", "-I"], capture_output=True, text=True).stdout.split()
    for ip in [i for i in ips if "." in i and not i.startswith(("127.", "172.17."))]:
        try:
            socket.create_connection((ip, port), timeout=2).close()
            check(f"port {port} closed on {ip}", False, "connected")
        except OSError as e:
            check(f"port {port} closed on {ip}", True, type(e).__name__)
    print("[INFO] Also confirm from another LAN machine: nc -vz <gx10-ip> 1234 should fail")


def canary():
    token = f"CANARY-{uuid.uuid4().hex[:12]}"
    post({"model": MODEL, "max_tokens": 20, "reasoning_effort": "none",
          "messages": [{"role": "user", "content": f"Repeat this code exactly: {token}"}]})
    time.sleep(2)
    hits = []
    for d in LOG_DIRS:
        if d.exists():
            r = subprocess.run(["grep", "-rlaF", token, str(d)], capture_output=True, text=True)
            hits += [l for l in r.stdout.splitlines() if "/models/" not in l]
    check("canary absent from LM Studio dirs", not hits, ", ".join(hits) or f"{token} not found")


if __name__ == "__main__":
    if not (KEY and MODEL):
        sys.exit("Set LOCAL_AI_API_KEY and LOCAL_AI_MODEL")
    auth()
    loopback_only()
    thinking()
    json_schema()
    canary()
    if "--skip-speed" not in sys.argv:
        speed()
