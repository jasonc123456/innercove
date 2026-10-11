# Isolated GX10 browser voice verification

This is a proposed operator runbook, not a record of GX10 API/browser acceptance. Hour 2 is published at `914ff6b`; the live GX10 checkout was reported at `c214ac9`. Leave that checkout, Compose services, database, firewall and Qwen unchanged. This native test uses a new clone, its own freshly generated encrypted fictional database, one loopback port, real D47 session authentication and existing host whisper/base.en/FFmpeg. Replies use FakeProvider (text); this acceptance does not verify Qwen.

Ownership coordination: the user explicitly authorized microphone permission for this isolated app. The new `scripts/voice-verify.mjs` entry point changes only `microphone=()` to `microphone=(self)` after A's standard security hook; CSP and every other directive stay intact. A's production app/main/Compose remain unchanged and continue disabling microphone. A should review this isolated entry point before broader deployment. C's existing composer/UI is reused.

## GX10 setup (new SSH session)

Replace `<published-test-commit>` with the published commit containing this runbook/runner. Do not pull or build inside the running checkout. New dependency downloads/builds happen only inside the test clone; no apt installation is needed.

```bash
set -eu
command -v git node npm python3 /usr/bin/ffmpeg
node --version
uname -m
# Must be unused. Inspect output; select another test port if occupied.
ss -ltn 'sport = :18080'
test -x "$HOME/innercove-stt-hour1/whisper.cpp/build/bin/whisper-cli"
test -r "$HOME/innercove-stt-hour1/whisper.cpp/models/ggml-base.en.bin"
# Native binary/library check, not a container-host compatibility assumption.
ldd "$HOME/innercove-stt-hour1/whisper.cpp/build/bin/whisper-cli"
"$HOME/innercove-stt-hour1/whisper.cpp/build/bin/whisper-cli" --help >/dev/null
/usr/bin/ffmpeg -version
findmnt -no FSTYPE /dev/shm
voice_checkout="$HOME/innercove-voice-browser-verify"
test ! -e "$voice_checkout"
git clone https://github.com/jasonc123456/innercove.git "$voice_checkout"
git -C "$voice_checkout" checkout --detach '<published-test-commit>'
cd "$voice_checkout"
npm ci
npm ci --prefix web
npm run build
npm run build --prefix web
node --test scripts/voice-verify-smoke.mjs
VOICE_VERIFY_PORT=18080 node scripts/voice-verify.mjs
```

Require Node ≥22 and tmpfs `/dev/shm`; resolve any missing library before proceeding. Port collision fails startup and cleans the test DB; the runner never kills another process. Runner forces known runtime/model paths, loopback bind and FakeProvider, does not read the live `.env`, and rejects the live ports 8000/8001/1234. whisper opens the existing model read-only; the native path does not chmod/mount/mutate it or rebuild/download tools/model. Audio scratch remains private tmpfs under `/dev/shm`; the encrypted DB is in a unique mode-0700 OS temporary directory printed at startup. No content logging. Model filesystem permissions are unchanged; this is native read-only model use, not a read-only mount/sandbox claim.

Log the actual clone/temp-directory/run in SETUP_LOG before operating, with its actual commit/port/path and undo below. The instructions themselves are not evidence that provisioning or verification occurred.

## Initialize only the isolated fictional hub

Keep the server terminal open. In another GX10 terminal, use a new fictional passphrase, not the live hub passphrase. This command prompts without echo and pipes JSON on stdin; no secret in argv or shell history. It targets only the test port. Adjust it if the port changed.

```bash
python3 -c 'import getpass,json; print(json.dumps({"passphrase":getpass.getpass("New fictional test passphrase: ")}))' \
  | curl --fail --silent --show-error -H 'Content-Type: application/json' \
      --data-binary @- http://127.0.0.1:18080/api/setup
```

An already initialized hub returns conflict; do not reset another store. Setup does not issue a session: sign in as `admin` with that same fictional passphrase in the tunneled browser. Sessions are real HttpOnly/SameSite cookies; cross-origin mutations are refused. No auth bypass or environment passphrase.

## Local tunnel and browser

On the laptop/workstation, replace `<gx10-ssh-target>` with the existing approved SSH alias/user@host. No private address or credentials are committed here. Confirm local port 18081 is unused; the tunnel fails if occupied.

```bash
ssh -N -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:18081:127.0.0.1:18080 '<gx10-ssh-target>'
```

Open `http://localhost:18081` in a normal browser. Localhost is the intended secure microphone context; plain HTTP at a LAN address is insufficient. UI and API share the same tunneled origin, preserving Host/Origin checks. Cookies are scoped by host, not port: avoid other InnerCove sessions on `localhost` during this experiment (or use a dedicated browser profile), so the test cookie cannot replace a live session cookie.

Acceptance: sign in → type a fictional draft → Microphone → speak a short fictional sentence → Stop → wait for editable appended transcript → edit it → explicitly Send → receive a text reply from FakeProvider. Record browser/version/MIME, actual latency and pass/fail without audio/transcript content. Confirm no chat request before Send. Test Cancel during capture/processing, microphone denial, lock/sign-out/unmount cleanup, 60-second stop and server rejection of codec-padded overlong audio. This is pending real hardware/browser acceptance; local automated tests only exercise the isolated configuration with HTTP injection.

## Cleanup / undo (operator only)

Ctrl-C in the test-server terminal: graceful shutdown cancels STT children, closes SQLCipher and removes only its generated test DB directory. Ctrl-C in the tunnel terminal ends forwarding. If the process was SIGKILLed or the host crashed, first ensure this test process and its children have stopped, then remove only the exact printed `innercove-voice-verify-*` directory (including DB/WAL/SHM); never use a broad wildcard. After preserving content-free evidence, remove the dedicated clone:

```bash
rm -rf "$HOME/innercove-voice-browser-verify"
```

No Docker cleanup, package removal, model deletion, firewall changes or live service restart belongs to this browser test. The existing runtime/provisioning undo remains in SETUP_LOG. None of these setup/undo commands was executed on GX10 while preparing this runbook.

Local preparation checks (2026-10-10): compiled isolated smoke PASS, including actual ephemeral loopback listener, real D47 session/Origin checks, SQLCipher header and cleanup; default app microphone policy unchanged. Full suite 195/195, typecheck, backend/web builds, validate 52/52, safety 33/33, JS/Bash syntax and whitespace checks PASS. Initial smoke setup assertion corrected from 200 to the existing 201 API response. No browser microphone or GX10 API run was performed.
