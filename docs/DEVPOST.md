# Devpost submission text

## Elevator pitch

Say what you really feel. InnerCove is a local AI wellness companion on the ASUS GX10: no cloud, encrypted on-device data, and you decide exactly what the AI can see.

## Project story

## Inspiration

Most of us have typed something into an AI chat and then deleted it before sending. Not because the AI couldn't help, but because we didn't know who else would read it. For a wellness companion, that hesitation defeats the purpose: the things people most need to talk through, like a fight at home, a bad grade they're hiding, or a night when everything feels pointless, are exactly the things they won't write when their words go to someone else's server.

So we asked: what if the AI lived on a box you own? The ASUS GX10 is powerful enough to run a 27-billion-parameter model locally, which means a companion can be both genuinely helpful and genuinely private. InnerCove is built around one idea: **people open up when they know what happens to their words.**

## What it does

InnerCove is a private AI wellness companion that runs entirely on the ASUS GX10. Nothing is sent to a cloud AI provider.

- **Chat that stays on the device.** Saved chats, the diary and memories live in a SQLCipher-encrypted database, unlocked with a passphrase that is never stored. Restart the box and it locks again.
- **You see exactly what the AI saw.** Under every reply, "Had access to" lists the diary entries and memories it used, and one tap shows the exact text that was sent. Each diary entry has its own "AI may use this" switch. Turn one off and InnerCove drops it, and the earlier exchanges that used it, from the next reply, and tells you so.
- **Memories you control.** InnerCove notes lasting things ("Has a biology exam on Friday", "A friend recently stopped talking to them") so later chats feel personal. It shows each note the moment it writes it, and you can turn it off, edit it or delete it. It never records diagnoses or medication.
- **Say it without keeping it.** Temporary chats live only in the browser tab. Reload, and they're gone. Nothing is written to the hub.
- **A diary with feelings.** Pick how you felt when you wrote an entry. When you share an entry with the AI, it knows that feeling too.
- **Safety that doesn't depend on the AI.** A rule-based layer screens every message before the model sees it. The highest-risk messages get a reviewed, pre-written reply with the 988 Suicide & Crisis Lifeline and 911, and never reach the model. Every model reply is screened before it is shown. This works even when the model is offline. Because InnerCove is private, it doesn't report anyone to anyone: it gives people the number and the choice.
- **Your words are yours to take, or delete.** Export a chosen date range of diary entries or memories, unticking anything you'd rather keep private, for example to share with a counselor. Or delete everything in one step.
- **Voice, transcribed on the box.** Speak instead of typing. Audio is transcribed locally with whisper.cpp and lands in your draft for you to review. Nothing is sent automatically.
- **Pick how it talks.** Warm, Calm, or Upbeat. Safety replies stay the same in every tone.
- **Works on your phone.** It's served over HTTPS on the local network with a local certificate authority, so phones get the full experience, including the microphone.

InnerCove is a non-clinical companion. It is not therapy, a diagnosis tool or an emergency monitoring service, and it says so.

## How we built it

- **Model:** Qwen3.8-27B (Q6_K quantization, 262K context) served by LM Studio on the GX10's GPU, listening only on the machine itself. We ran a 40-case evaluation on the GX10 to choose the model and quantization, then iterated the system prompt (v2 → v4.2) against companion-quality and safety test sets.
- **Server:** TypeScript on Node.js 22 with Fastify. A chat turn runs: safety pre-screen → permission-filtered retrieval of the memories and diary entries the user allowed → prompt assembly → streaming generation over SSE, released sentence by sentence only after the output screen passes it.
- **Data:** SQLite with SQLCipher encryption (better-sqlite3-multiple-ciphers), Drizzle ORM with hand-written migrations that fail closed, and full-text search with secure delete. Every query is scoped to the user, and the AI reads only through a permission-filtered port.
- **Shared contracts:** Zod schemas in a shared core package used by both server and web.
- **Web app:** React, Vite and Tailwind CSS v4, built mobile-first with a desktop layout, light and dark themes.
- **Voice:** whisper.cpp (base.en) and ffmpeg on the GX10, with audio kept in memory (tmpfs) while it's transcribed.
- **Security:** mandatory sign-in with optional two-factor (TOTP), HttpOnly SameSite=Strict session cookies, Origin checks, a strict Content-Security-Policy, and logs that contain event types and IDs only, never what anyone wrote.
- **Infrastructure:** Docker Compose on the GX10, HTTPS from a name-constrained local CA, Tailscale for team access, and GitHub Actions CI running typechecks, 246 tests, contract validation, safety checks and a gitleaks secret scan on every push.

## Challenges we ran into

- **Warm and safe at the same time.** Early prompts were either cold or, worse, kept re-asking a struggling user about suicide without ever offering help. We rewrote the prompt several times against a scored safety set. Prompt v4.1 passed 274 of 284 safety checks and 102 of 108 companion checks, with zero critical failures, and now offers 988 and helps make a small plan instead of interrogating.
- **Risk doesn't disappear after one message.** A short follow-up like "hurt my self" could slip past a per-message check. We made risk carry across the next few turns so the crisis support stays visible.
- **Memories that help without overstepping.** Our note writer first missed real news (an exam result, a friendship ending), then over-shared other people's private details. We tuned it against the real model until it remembered what matters and left out what isn't the user's to record.
- **The browser wouldn't give us the microphone.** Browsers only allow the mic on HTTPS, and our app runs on a local network. We built a local certificate authority restricted to private addresses, so phones trust the hub without anything touching the internet.
- **Native code on ARM64.** SQLCipher and whisper.cpp both needed native builds on the GX10, and a whisper binary built on the host wouldn't run inside our container because the two have different system library versions. We compile it inside the image instead.
- **Honesty under failure.** A test stub's canned reply once looked like a real (and bad) answer. Now the app never fakes a reply: if the model is down, it says so.

## Accomplishments that we're proud of

- A full companion experience (chat, diary, memories, voice, export, safety) that runs with **no cloud AI at all**.
- The "Had access to" panel. Privacy you can verify, not just a promise in a policy.
- Crisis support that works even when the AI doesn't.
- 246 automated tests, a scripted end-to-end demo check, and green CI on a codebase four people built in parallel over one event.

## What we learned

- Local models are now good enough for warm, nuanced conversation, and the GX10 runs a 27B model comfortably.
- Privacy is a feature users can see: showing exactly what the AI read builds more trust than any promise.
- Safety belongs in deterministic code and reviewed text, not in the model's goodwill.
- Small prompt wording changes matter. "Upbeat tone" once made the model tell a lonely user they seemed in a good mood.

## What's next for InnerCove

- **Host it on your own PC.** A consumer app with a Windows installer and a Mac app that runs a smaller 4–9B model and sets everything up in a guided wizard, no technical background needed. Manual deployment (Docker, LM Studio or your own model server) stays available for experienced users.
- **Passkeys** as another way to sign in, alongside the passphrase and two-factor.
- A consent-based "Summary to share" for a counselor, built from items the user picks.
- More than one user per hub, each with their own encrypted space.
- Crisis resources for more countries, and more languages.

## Built with

asus-gx10, qwen, lm-studio, whisper.cpp, typescript, node.js, fastify, react, tailwindcss, sqlite, sqlcipher, docker
