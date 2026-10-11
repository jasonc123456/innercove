# Hour 1 local transcription prototype

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

The existing DatabaseStore request gate applies: locked requests are 423, and no data is written. D47 additionally requires a server-verified session. **Production remains fail-closed (401 while unlocked) until A wires its session verifier** through B's `dataRoutes(app, hasValidSession)` seam; default authorization is false, with no env/header/loopback bypass. The verifier must consume A's authenticated server session, not trust a caller-supplied username/token field. Controlled tests provide an internal test verifier; that is not a deployment path. A's missing session implementation is an explicit integration blocker, separate from STT feasibility.

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
