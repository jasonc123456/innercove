# GX10 initial setup prompt (LM Studio + remote desktop)
Paste the block below into the first Claude Code session on the ASUS GX10. It sets up the machine only; Phase 0 testing comes after, with the kickoff prompt in `PROJECT_PLAN.md` "Start here".

````text
You are setting up a borrowed ASUS Ascent GX10 (NVIDIA GB10, 128 GB unified memory, ARM64, DGX OS / Ubuntu-based) for Team TokenSmith's InnerCove hackathon project. Read docs/PROJECT_PLAN.md ("Start here", §3 "Security boundaries", §3b, §5 Phase 0) and docs/DECISIONS.md (D12, D13, D18) first.

Goal: LM Studio serving Qwen3.8-27B on 127.0.0.1:1234 with auth on, plus xrdp so a teammate can open the desktop remotely and change model settings in the LM Studio app.

Ground rules
- The GX10 is borrowed and must be returned in the same condition. Log every system change (package, config file, service, firewall rule, user setting) in docs/SETUP_LOG.md with the exact undo step. Keep it to one line per change.
- Show me each sudo command and why before running it. Don't install or change GPU drivers or CUDA; DGX OS ships them.
- Never write secrets (API tokens, passwords) into the repo or SETUP_LOG.md. Store the LM Studio token in ~/.config/innercove/lmstudio.token (chmod 600); the app reads it via LOCAL_AI_API_KEY from an untracked .env. Check that .env is in .gitignore.
- Prefer files from our USB SSD (models, LM Studio installer); venue internet may be slow or blocked. Ask me for the SSD mount path.
- Stop and ask if anything conflicts with the plan or needs a judgment call.

Step 1: Baseline (read-only)
- Record OS version, kernel, architecture, `nvidia-smi` output, free disk space, hostname, IP addresses, whether sshd is running, and current firewall state (ufw status). Put a short summary at the top of SETUP_LOG.md.

Step 2: Remote access
- Make sure SSH works with key-based login for our laptops (ask me for the public keys).
- Install xrdp. If GNOME over xrdp is unreliable (black screen, session conflicts), install a light session (xfce4) for xrdp only and set it via ~/.xsession; the local GNOME desktop stays unchanged. Note: the same user can't usually hold a local GNOME session and an xrdp session at once; tell me if I need to log out locally.
- Fix the usual xrdp issues on Ubuntu (polkit "color managed device" prompts, ssl-cert group for the xrdp user) only if they actually occur.
- Lock RDP down. Default: xrdp accepts connections only from localhost, and we connect through an SSH tunnel (`ssh -L 3389:localhost:3389 <user>@<gx10>`, then RDP to localhost:3389). Check `man xrdp.ini` for how this version binds to 127.0.0.1. If that isn't possible, use ufw to allow 3389 only from the travel router's subnet (ask me for it), and never from venue Wi-Fi.
- Test: connect from a laptop over the tunnel and confirm the desktop opens.

Step 3: LM Studio
- Install the Linux ARM64 build (from the SSD, or lmstudio.ai if the SSD doesn't have it). If it's an AppImage: Ubuntu 24.04 needs libfuse2t64, and the Electron sandbox may fail under AppArmor's user-namespace restriction. Fix that with a narrow AppArmor profile for the app, not by disabling the restriction system-wide. Avoid --no-sandbox unless I agree.
- Update the llama.cpp/CUDA runtime inside LM Studio to the newest available (the Qwen3.8 "qwen35" architecture needs a recent one). Record the runtime version.
- Install the `lms` CLI if the app offers it.
- Import the models from the SSD (Qwen3.8-27B at Q4_K_M and Q6_K; Qwen3.6-35B-A3B as the fallback) with `lms import` or by copying into the LM Studio models folder. Record paths and SHA-256 sums.

Step 4: Server and model settings (D18, plan §3)
- Server: port 1234, bound to 127.0.0.1 only. "Serve on Local Network" OFF. Authentication ON with a new API token (store it as above).
- The server must survive an xrdp disconnect and a reboot: use LM Studio's run-on-login/headless service option if this version has it; otherwise tell me the options.
- Load Qwen3.8-27B Q4_K_M with: context length 32768 (16384 if memory or prefill is a problem), all layers on GPU, flash attention on, KV cache F16 (Q8_0 if needed; not Q4_0), keep model in memory on, no idle auto-unload (TTL off). Don't load the vision projector if the app lets you skip it.
- Leave sampling to the app (it sends temperature 0.7, top_p 0.8, top_k 20, presence_penalty 1.5 and reasoning_effort "none" per request).
- Write the final settings into SETUP_LOG.md so they can be reapplied after a reload.

Step 5: Verify (these are Phase 0 checks 4–6; record pass/fail in docs/DECISIONS.md "Other checks")
- `curl http://127.0.0.1:1234/v1/models` without the token returns 401; with the token it lists the model.
- From another machine on the LAN, port 1234 is unreachable. `ss -ltnp` shows 1234 bound to 127.0.0.1 only.
- One chat request with reasoning_effort "none" and an explicit User-Agent returns an answer with no reasoning in `content`, `reasoning_content` or `reasoning`.
- RDP is reachable only as designed in step 2.

Step 6: Hand back to me
- A summary (max 15 lines): what's installed, how to connect over RDP, where the token is, the loaded model and settings, test results, and anything that failed.
- Don't start Phase 0 testing or write app code; that's a separate session.
- Commit only docs/SETUP_LOG.md and the DECISIONS.md check results, with a short message and no co-author line. Ask before pushing.

Before we return the GX10 (do this only when I say so): follow SETUP_LOG.md's undo steps in reverse, remove the models we added, wipe ./data and the LM Studio logs, and confirm the machine matches the baseline from step 1.
````
