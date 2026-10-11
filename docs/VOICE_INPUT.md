# Local voice-input prototype

Scope: local transcription into an editable draft, never automatic submission; text replies only. No microphone UI or continuous listening. The user explicitly authorized this timebox despite voice's earlier postponed label. B owns the contract/data API; A owns session/security/deployment integration and C the future recorder/draft UI. No live deployment changes are part of this experiment.

## Chosen runtime and GX10 experiment

One runtime: whisper.cpp v1.8.2, English `base.en`, CPU-only, two threads. FFmpeg decodes recordings to mono 16 kHz signed 16-bit PCM. [Upstream](https://github.com/ggml-org/whisper.cpp/tree/v1.8.2) supports Linux ARM64; this does not establish GX10 latency. Model download is provisioning only; audio never goes to a network transcription service.

GX10 SSH alias is unavailable on the local workstation. Run this **separate experiment on GX10**, not in the app container and not against live data. Prerequisites: Git, CMake, C++ compiler, FFmpeg, eSpeak and GNU time. Check before installing:

```bash
command -v git cmake g++ ffmpeg espeak /usr/bin/time
uname -m
node --version
```

If tools are missing, the operator can install them with `sudo apt-get install --no-install-recommends build-essential cmake ffmpeg espeak time`. Before doing so, record the actually new packages and exact undo in `docs/SETUP_LOG.md`; never purge pre-existing packages. Record the experiment directory/model creation too, with undo `rm -rf "$HOME/innercove-stt-hour1"` only if this experiment created that directory. These are pending instructions, not installation evidence; no GX10 install/undo was executed here.

After checking that `~/innercove-stt-hour1` does not already exist, run:

```bash
set -eu
stt_experiment="$HOME/innercove-stt-hour1"
test ! -e "$stt_experiment"
mkdir -m 700 "$stt_experiment"
git clone --depth 1 --branch v1.8.2 https://github.com/ggml-org/whisper.cpp.git "$stt_experiment/whisper.cpp"
cmake -S "$stt_experiment/whisper.cpp" -B "$stt_experiment/whisper.cpp/build" -DCMAKE_BUILD_TYPE=Release -DGGML_CUDA=OFF -DWHISPER_BUILD_TESTS=OFF
cmake --build "$stt_experiment/whisper.cpp/build" --target whisper-cli -j 2
bash "$stt_experiment/whisper.cpp/models/download-ggml-model.sh" base.en "$stt_experiment/whisper.cpp/models"
espeak -w "$stt_experiment/fictional.wav" 'This is a fictional student named Jordan. Today I studied chemistry and took a peaceful walk in the park.'
ffmpeg -nostdin -v error -i "$stt_experiment/fictional.wav" -ar 16000 -ac 1 -c:a pcm_s16le "$stt_experiment/short.wav"
ffmpeg -nostdin -v error -stream_loop -1 -i "$stt_experiment/short.wav" -t 59 -ar 16000 -ac 1 -c:a pcm_s16le "$stt_experiment/near60.wav"
for stt_clip in short near60; do
  /usr/bin/time -f 'elapsed_s=%e user_s=%U system_s=%S max_rss_kib=%M' -o "$stt_experiment/$stt_clip.metrics" \
    "$stt_experiment/whisper.cpp/build/bin/whisper-cli" -ng -t 2 -l en -nt -np \
    -m "$stt_experiment/whisper.cpp/models/ggml-base.en.bin" -f "$stt_experiment/$stt_clip.wav" \
    -otxt -of "$stt_experiment/$stt_clip" > /dev/null 2> "$stt_experiment/$stt_clip.runtime"
  cat "$stt_experiment/$stt_clip.metrics"
done
```

Inspect the fictional `.txt` results locally for recognizable words; report metrics and quality, not personal audio/transcripts. Retain the directory until evidence is recorded, then use the recorded undo. CPU mode avoids Qwen/GPU configuration changes. This does not start, stop or redeploy InnerCove.

## Browser handoff

Hour 2 should probe `MediaRecorder.isTypeSupported()` rather than assume one format ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static)). Candidate types: `audio/webm;codecs=opus`, `audio/ogg;codecs=opus`, `audio/mp4` (AAC), plus WAV for fixtures. FFmpeg decoding is required; a MIME label is not evidence of duration/validity. Browser/device capture remains untested. `getUserMedia` requires a secure context: localhost or HTTPS; the approved plain-HTTP LAN demo is not sufficient. A's current Permissions-Policy disables microphone access and requires coordination for Hour 2. Keep tap-start/tap-stop, 60-second auto-stop, transcript editing and explicit Send in C's future work.

## API and configuration

`POST /api/transcribe` takes one raw recording Blob as the request body, with `Content-Type: audio/webm`, `audio/ogg`, `audio/mp4` or `audio/wav` (codec parameters allowed). No JSON/base64, multipart, client duration, filenames or query parameters. Response: `{ text, durationMs }`; `text` is a draft to review/edit, not a chat message. The shared response and limits live in `packages/core/src/api/transcribe.ts`.

Limits: 4 MiB encoded upload; 15-second total upload deadline; one admitted upload/transcription per API instance with no queue (409 busy); 90-second total processing deadline; at most 60 seconds decoded 16 kHz mono PCM, measured from samples rather than container/client metadata. Decoding reads at most 60 seconds plus one sample and rejects that extra sample rather than silently truncating overlong recordings. Empty/near-silent PCM (RMS <50 out of 32768) and empty/non-speech output are rejected. This is basic silence detection, not a VAD/accuracy guarantee; quiet microphones and noisy backgrounds need Hour 2 evaluation.

The existing DatabaseStore request gate applies: locked requests are 423, and no data is written. D47 additionally requires a server-verified session. **Historical Hour 1 status: production remained fail-closed (401 while unlocked) until A wired its session verifier** through B's `dataRoutes(app, hasValidSession)` seam; default authorization is false, with no env/header/loopback bypass. The verifier must consume A's authenticated server session, not trust a caller-supplied username/token field. Controlled tests provide an internal test verifier; that is not a deployment path. That Hour 1 blocker is now closed by A’s real SessionStore callback; production uses the verified cookie and same-origin guard.

After that integration, configure the native API's local `.env` with absolute paths:

```dotenv
STT_WHISPER_BIN=/absolute/path/to/whisper.cpp/build/bin/whisper-cli
STT_MODEL_PATH=/absolute/path/to/whisper.cpp/models/ggml-base.en.bin
STT_FFMPEG_BIN=/absolute/path/to/ffmpeg
```

Use the existing README's explicit `node --env-file=.env` native startup path. Missing/non-executable binaries or model yield 503 `MODEL_UNAVAILABLE`; malformed/silent/overlong input yields 400 `VALIDATION_ERROR`. Runtime failures, deadline/cancellation use generic content-free errors. Audio/transcript/process output are never logged. Model/runtime are never auto-downloaded at API startup and there is no network/cloud fallback. The optional runtime does not prevent normal text-only startup. Packaged images do not include these tools/model or mounts; A must own that later deployment work, not modify the live image in this hour.

FFmpeg and whisper run directly with fixed argument arrays, no shell. The decoder uses a forced demuxer, file/pipe-only protocols, one decode/filter thread and a 64 MiB per-allocation cap; whisper uses CPU/two threads. Raw audio and decoded WAV live only in unique mode-0700 tmpfs directories under `/dev/shm`, with mode-0600 files. Disk-backed scratch is rejected. Transcripts are captured in bounded memory, not files. Cleanup runs in `finally` on success, failure or cancellation; children are SIGKILLed on abort and awaited through close. No inference prompt/response, conversation, memory, diary or message is created. Timeout responses release request leases even if a defective injected adapter ignores abort; admission stays busy until adapter cleanup actually settles, avoiding overlapping workers. Shutdown cancels active work and incomplete uploads.

## Actual local checkpoint (2026-10-10)

Local Linux x86_64 / Node v22.22.1, whisper.cpp v1.8.2 (`4979e04`), CPU/two threads, English base.en. Model SHA-256: `a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002`. All tools/models/audio were isolated under `/tmp`; no system packages installed and no GX10 changes. Local CMake and FFmpeg were provided by temporary Python-venv packages; TTS used extracted eSpeak packages. API scratch used `/dev/shm`. These local tools are experiment artifacts, not production dependencies.

| Fictional synthetic clip | Whisper-only wall / CPU user / CPU system | Whisper peak RSS | Adapter wall including decode/model startup |
| --- | --- | --- | --- |
| 6.10325 s | 2.91 / 5.30 / 0.26 s | 289800 KiB | WAV 3.408 s; WebM/Opus 3.345 s; Ogg/Opus 3.683 s; MP4/AAC 4.184 s |
| 59 s (repeated fictional fixture) | 9.54 / 18.38 / 0.30 s | 337932 KiB | WAV 13.238 s |

All formats produced recognizable fixture wording (expected “chemistry” recovered); actual decoded MP4 duration was 6.144 s due to codec padding. The real adapter rejected a decoded 61-second WAV. Repetition/TTS are a plumbing proof, not natural microphone recognition-quality evidence. No GX10 runtime, actual browser recording, accents/noise, session or live app measurements claimed.

Controlled tests cover production registration/fail-closed session/lock gating, strict uploads/limits, draft-only response with every encrypted table unchanged and no content logs, adapter failure/empty output/overlong response, concurrency/deadline/lease draining, actual HTTP disconnect and incomplete-upload timeout, shutdown, child cancellation/output bounds and unique tmpfs cleanup. Disk scratch and silence/duration sample limits are tested. Local `npm test`: 167/167 across 15 files. Core/server typechecks, shared validation 52/52 and build/safety results are recorded in the Phase log. Initial cleanup fixture mistakenly assumed `/tmp` was disk-backed on this machine; corrected to the repository's actual disk filesystem and reran the suite.

Ready for Hour 2: run the exact ARM64 experiment above; A supplies D47 session verification and reviews microphone Permissions-Policy/HTTPS; C adds format probing and tap-start/tap-stop/60-second auto-stop with explicit editable draft/Send, recording/processing/cancel/error states, and verifies browser capture and quiet/noisy input. B supports authenticated API acceptance and format/cleanup checks. No microphone UI, speech replies, continuous listening or auto-submit is implemented here.

Resume verification: recovered final backend/core build exit 0 and safety 33/33. Corrected whisper process failure mapping to content-free 503; focused transcription tests 10/10, server typecheck and core/backend build passed afterward. The prior full 167-test suite and shared validation 52/52 were verified from the interrupted run; no synthetic-audio experiment was repeated.

Integration verification: preserved upstream exercise/breathing changes through `f38f463`; combined backend suite 176/176 across 17 files, typecheck, contract validation 52/52 and core/backend build passed. Documentation shell blocks/link and `git diff --check` passed. Live deployment/Compose and microphone/browser acceptance were not run.

## Hour 2 checkpoint — 2026-10-10

User-reported GX10 CLI results: whisper.cpp v1.8.2, base.en, ARM64 CPU/two threads. Short fictional synthetic clip: elapsed 2.85 s, user 5.33 s, system 0.16 s, peak RSS 288000 KiB. Repeated 59-second clip: elapsed 8.38 s, user 16.11 s, system 0.21 s, peak RSS 336380 KiB. Recognizable fixture text, combined exit 0. Runtime/model live under `~/innercove-stt-hour1`; live app unchanged. These supersede the pending ARM64 CLI item above; they do not establish API/browser or natural-speech performance.

The composer now offers Microphone → Stop recording, elapsed time, automatic stop at 60 seconds, Cancel, processing and content-free errors. It probes supported audio containers, uploads a raw Blob through the shared contract and appends the transcript to the latest editable draft, preserving text entered before/during recording. Send remains explicit and disabled while voice work is active. Tracks are released on stop/cancel, and pending permission results/uploads are invalidated on cancellation, unmount, lock/sign-in/mode changes. Audio exists only in memory; no playback URLs, browser storage, content logging or speech output.

Ownership: user explicitly authorized this minimal edit to C's MessageInput after inspecting latest UI work; AppSession, App/router and A's policy/session code remain unchanged. C should review composer UX and lifecycle transitions. Latest AppSession now signs in through `/api/session` and redirects on 401/423; flags control UI cleanup, never server authorization. Latest integration now uses A’s real D47 verifier and HttpOnly session cookie; unauthenticated requests remain rejected.

Exact deployment/integration steps (A, then C/B; not executed here):
1. Completed in A’s `c214ac9` integration: real SessionStore guard, HttpOnly cookie, same-origin checks and `dataRoutes(app, request => guard.isValid(request))`. Sign in through `/api/session`; unauthenticated/expired/revoked requests remain 401. No bypass. Confirm this exact integration in the isolated deployment.
2. Approve a secure same-origin recorder context (localhost or HTTPS) and permit microphone only for that origin, e.g. `microphone=(self)`, preserving every other Permissions-Policy/CSP directive. Current policy still blocks capture; no security header changed here. See [getUserMedia requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
3. Configure absolute native paths: STT_WHISPER_BIN under the experiment's whisper.cpp/build/bin, STT_MODEL_PATH under whisper.cpp/models, STT_FFMPEG_BIN from `command -v ffmpeg`; use README env-file startup. For a container, A must explicitly package/mount tools and model read-only and ensure tmpfs `/dev/shm` capacity; current image lacks STT. Do not redeploy live GX10 as part of this handoff.
4. On an isolated unlocked fictional hub, verify real authenticated Blob API, then supported Chrome/Safari/Firefox microphone formats, stop/60-second boundary (including codec padding), cancellation/lock/sign-out/unmount, existing draft preservation, explicit Send, empty/quiet/noisy audio and text-only replies. Background-tab timer throttling may exceed 60 seconds: server sample-measured limit rejects overlong audio rather than truncating.

Provisioning evidence received: the GX10 apt-history transaction at 20:17:25–20:17:30 confirms 71 newly installed ffmpeg/eSpeak packages (including automatic dependencies) and one upgrade to pre-existing libssh-4. SETUP_LOG records the exact new-package list, versions of the requested tools, simulated targeted undo and preservation of the pre-existing upgraded package. No undo executed.

Hour 2 local verification: 189/189 tests across 18 files, including 13 controlled recorder/API-client tests (supported format/raw Blob/draft append, 60-second stop, cancellation/late permission, late response suppression, HTTP 400/401/409/423/503, permission failure, oversized recording/error, client deadline/invalid response). Server typecheck, core/backend build, web production build, validate 52/52, safety 33/33 and diff whitespace checks passed. These use mocked media devices/MediaRecorder/fetch; no actual browser microphone or authenticated API end-to-end result claimed. Existing Hour 1 server tests separately cover persistence/privacy/cleanup. C should additionally verify rendered controls, keyboard/accessibility and mobile layout.

Latest integration correction: A’s real D47 implementation arrived during the pre-merge pull (`c214ac9`), closing the missing-session blocker. Added production-registration assertions for real sign-in cookie, empty-upload validation, cross-origin refusal and revoked-cookie refusal. The locked-store gate retains 423; unlocked unauthenticated requests are 401. Microphone Permissions-Policy remains disabled and requires A’s approval; no live deployment changes.

Final post-session integration verification: 195/195 tests across 19 files PASS (includes real SessionStore cookie/Origin/revocation assertions), server typecheck, core/backend build, web production build, validate 52/52, safety 33/33 PASS. Initial integration test incorrectly expected 401 for the locked gate; corrected to existing 423 and reran full suite successfully. Both upstream reset-log changes and voice provisioning records preserved in conflict resolution. No actual browser/API transcription or live deployment verification performed.

## Isolated browser verification preparation

See [VOICE_VERIFY.md](VOICE_VERIFY.md) for the separate native clone, loopback/SSH tunnel, temporary encrypted fictional DB, real D47 sign-in and self-only microphone policy. A’s production policy stays unchanged. Runtime/model are reused read-only by native whisper; no container binary compatibility assumption. Real GX10 API/browser acceptance remains pending; text reply uses FakeProvider to avoid Qwen traffic.

## User-observed isolated GX10 browser checkpoint — 2026-10-10

At `3a4cc97`, backend/web builds and isolated configuration smoke passed (exit 0), followed by recording → Stop → transcription appended to editable draft, preserved typed text, editing, explicit Send and a FakeProvider text reply. Cancel during recording appended no transcript; automatic stop at approximately 60 seconds worked. Separate native server used loopback 18080 via local SSH tunnel; production deployment unchanged. This closes the basic isolated browser path, not full acceptance or Qwen verification.

At that checkout web had no committed lockfile: `npm ci --prefix web` failed; `npm install --prefix web --no-audit --no-fund` succeeded. Corrected runbook and detailed results are in [VOICE_VERIFY.md](VOICE_VERIFY.md). Fictional DB `/tmp/innercove-voice-verify-0joVoy` cleanup remains unconfirmed. Processing cancellation, microphone denial, lock/sign-out/navigation cleanup, codec-padded overlong rejection, content-log/audio cleanup checks and production voice-to-Qwen operation remain unverified on GX10/browser; local mocked/API tests are separate evidence.

## Microphone level UI — 2026-10-11

The composer uses the existing inline-SVG icon style (no installed icon library):
a microphone beside the draft, accent + visible Stop while recording, five
compact bars labelled Mic level below it, and a processing spinner. The meter
uses one AnalyserNode on the recorder's existing stream, never a second capture
or a speaker connection. Smoothed RMS has a .008 noise floor, compressed/clamped
display range and 50 ms updates; reduced motion uses 250 ms updates with no
height transitions/spinner rotation. Meter samples remain transient in memory.

Stop, Cancel, recorder errors, automatic 60-second stop and the existing
session/lock/mode/unmount cancellation path dispose animation frames, source/
analyser nodes and AudioContext. Visualization disposal never stops tracks;
that remains the recorder's responsibility. Web Audio absence, initialization,
resume or sampling failure leaves recording/transcription available with a
static recording indicator. Levels are outside aria-live and do not represent
recognition confidence or emotion. Draft append/edit/explicit Send, API/auth,
policy and deployment interfaces remain unchanged.

Local checks: focused controlled recorder/meter/SSR composer tests 26/26;
web typecheck and production build passed; integrated npm test 231/231;
server typecheck, validation 52/52, safety 33/33 and git diff --check passed. SSR
render assertions and mocked audio lifecycle tests are not browser/microphone
verification. No browser tool or installed Chromium was available for visual
inspection. C/user should verify quiet/noisy mic responsiveness, five-bar
layout/mobile focus/reduced motion, static fallback, and disposal across
Stop/Cancel/error/lock/sign-out/navigation in an isolated browser. Previous
GX10 results remain historical evidence for the earlier UI. Live GX10 untouched.
