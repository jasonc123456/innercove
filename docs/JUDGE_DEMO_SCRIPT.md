# InnerCove: judges' demo script (privacy and local hosting)

**The one idea to land:** people only open up when they know what happens to their words. InnerCove runs entirely on the ASUS GX10 in front of you, so what someone writes on a bad night stays on this box, under their control.

Length: about 3 minutes; cuts for 2 minutes are marked **[cut]**. Use the fictional persona **Jordan** only. Words in quotes are spoken; lines starting with ▶ are what to do on screen.

---

## Before judges arrive (10 minutes)

- [ ] LM Studio running with the model loaded; the site open and signed in on the demo laptop (**Remember me unticked**).
- [ ] Hub content wiped and Jordan's persona loaded (README "Optional fictional persona seed").
- [ ] Nothing to add by hand: the persona's 8 entries are enough. 6 are shared with the AI (e.g. **Grade posted**); 2 are private (**Dad's new apartment**, **Library shift**).
- [ ] Chat set to **Save** with **Memories** on; tone **Warm**; start a **new chat**.
- [ ] Tabs ready: Chat, Diary, Memories, Admin (Hub status).
- [ ] Voice: only if the demo browser has the hub's address allowed (README "Voice input on the local network") and one test recording worked. Otherwise skip it.
- [ ] Nobody pushes server code to `main` from now until judging ends (dev mode restarts the API and signs everyone out).

---

## 1. Hook (20 s)

"Think about the last time you had something on your mind you didn't want to say out loud. Most AI companions send those words to a company's servers, where they're stored, reviewed, maybe used for training. If you know that, you hold back, and holding back is exactly what makes a wellness tool useless.

InnerCove is a private companion that runs completely on this ASUS GX10. No cloud AI, no company account, nothing leaves this box."

## 2. Show where it runs (20 s)

▶ Open **Admin → Hub status**.

"This is the proof, not a promise. The model, Qwen 27B, runs on this machine's GPU: **Model runs on: This machine only**. Everything you save is in an encrypted database, **Encryption: On (SQLCipher)**, locked with a passphrase that is never stored. Restart the box and it's locked again until you sign in."

## 3. Open up, and see exactly what the AI saw (40 s)

▶ Chat (Save, Memories on). Send: *"I keep putting off emailing my chem professor about my midterm grade."*

"Jordan writes to InnerCove the way they'd write in a journal. While the reply comes in, look under it."

▶ Tap **Had access to … ⌄** under the reply (it starts collapsed), then tap the *Grade posted* chip to show **What was sent**.

"InnerCove shows exactly what it had: the entries Jordan chose to share, like 'Grade posted', word for word. Jordan's private entries, like 'Dad's new apartment', are right there in the diary, and they were never sent. Every entry has its own switch: **AI may use this**."

## 4. Change your mind at any time (30 s) [cut: keep only the memory part]

▶ Diary → open **Grade posted** → untick **AI may use this entry** → back to Chat → send *"Can you help me figure out what to ask?"*

"Jordan takes it back. From the next message on, that entry and the earlier exchange that used it are left out, and InnerCove says so."

▶ Point to the notice *"The server left 1 earlier exchange out of this reply."*

▶ Send: *"My biology exam is on Friday."* Point to **Remembered from what you said**.

"InnerCove notes things worth remembering so it can be more personal next time, and it shows you each one the moment it writes it. **Don't use** turns it off. The Memories page lists everything it knows about you. Each one can be edited or deleted. It never notes diagnoses or medication."

## 5. Say it without keeping it (15 s) [cut]

▶ Switch to **Temporary**, send a message, reload the page.

"Some things you just need to say. Temporary chats live only in this browser tab. Reload, and they're gone. Nothing was written to the hub."

## 6. The hardest moment (25 s)

▶ Switch back to **Save**, start a new chat, send: *"I don't see the point of waking up tomorrow."*

"When someone says something like this, InnerCove doesn't improvise. A rule-based safety layer, not the AI, catches it and shows a reply written and reviewed in advance, with the 988 Lifeline and 911. It works even if the model is down. And because it's private, InnerCove doesn't report anyone to anyone. It gives them the number and the choice. Being heard without being reported is what lets people say this sentence at all."

▶ Start a **new chat** afterwards (risk carries over for the next few messages, so the card would come back).

## 7. Leaving is easy (15 s) [cut]

▶ Diary → **Export**: pick a date range, untick an entry. Then show **Settings → Delete all my data** (don't press it).

"Your words are yours to take: export the entries you choose, say, two weeks to share with a counselor, as a readable file. Or delete everything for good in one step."

## 8. Close (15 s)

"Private by design: the model, the data and the decisions stay on the device and with the person. That's what makes it safe to open up. InnerCove, on the ASUS GX10."

---

## If something goes wrong

- **Slow reply (8–14 s is normal for a long one):** keep talking over it; describe the "Had access to" area while it streams.
- **"InnerCove's AI model is offline":** the model stopped. Say "this is what users see instead of a made-up answer," jump to step 6 (works without the model), then the Hub status.
- **Signed out suddenly:** someone pushed server code. Sign in again; the hub unlocks on sign-in.
- **Crisis card appears on an ordinary message:** you didn't start a new chat after step 6. Start one.

## Likely questions, honest answers

| Question | Answer |
|---|---|
| What if the device is stolen? | The database is encrypted with SQLCipher. The key comes from the passphrase, which is never stored, and a restart locks it. "Remember me" is off by default and warns against shared devices. |
| Does anything go to the internet? | No. The model runs on this GX10 and listens only on this machine. The Hub status shows it. There's no third-party AI service and no analytics. |
| Do you log what people write? | No. Server logs hold event types and IDs, never message, diary or memory text. |
| How do you keep the AI safe? | Rule-based risk tiers run before the model. The highest tier gets reviewed, pre-written replies with 988/911 and never reaches the model. Every reply is screened before it's shown. In our eval (prompt v4.1): 274 of 284 safety checks passed, 0 critical failures. |
| Is it therapy? | No. It's a non-clinical companion, not a diagnosis or emergency-monitoring service. It points people to real help. |
| What hardware and model? | ASUS GX10, Qwen3.8-27B (Q6_K) in LM Studio on the GPU, 262K context. Voice is transcribed on the box too, with whisper.cpp. |
| Can more than one person use a hub? | Today one owner per hub. More accounts are on the roadmap. |
| Why not just use a cloud model? | Privacy is the product. People are more honest when nobody else can read it. Local also means no per-message cost, and it keeps working without internet. |

## Never say

- "End-to-end encrypted" (it's encrypted on the hub, not end-to-end), "HIPAA compliant", "clinically proven", or "guarantees safety".
- That it monitors users or alerts anyone in an emergency: it doesn't.
- Any real person's story or data: Jordan is fictional.
