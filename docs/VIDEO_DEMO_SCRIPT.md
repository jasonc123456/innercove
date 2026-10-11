# InnerCove: demo video script

**Target length:** about 2:45 (cut marked **[cut]** scenes for a 2:00 version). Check the hackathon's video limit first; most Devpost hackathons ask for 3 minutes or less.

**The one idea:** people open up when they know what happens to their words. InnerCove runs entirely on the ASUS GX10, so their words never leave it.

Use the fictional persona **Jordan** only. Narration is in quotes; ▶ is what's on screen.

---

## Before recording

- [ ] Hub wiped and Jordan's persona loaded (8 entries: 6 shared with the AI such as **Grade posted**, 2 private such as **Dad's new apartment**). Nothing to add by hand.
- [ ] Desktop browser at `https://192.168.2.151:8000` (use the LAN address, not the Tailscale name). Light or dark theme, but the same for every take.
- [ ] Phone with the local CA installed, signed in at the same address, microphone allowed, one test recording done.
- [ ] Chat set to **Save**, **Memories** on, tone **Warm**, a **new chat**.
- [ ] Close other tabs and notifications. Don't show the passphrase, two-factor codes or recovery codes.
- [ ] Screen recorder at 1080p (OBS, or the built-in recorder); phone: iOS Control Center or Android's screen recorder.
- [ ] A quiet room and an external mic for the narration if you have one. Record the voiceover separately if that's easier, then lay it over the screen recording.
- [ ] Replies take 8–14 s. In editing, speed up the waiting and label it on screen ("sped up"). Never cut a reply so it looks faster than it is without saying so.

---

## Scene 1: The problem (0:00–0:20)

▶ Black screen with white text, one line at a time: *"Ever typed something to an AI… and deleted it before sending?"* Then a shot of the ASUS GX10 on the desk.

"Most of us have. When you don't know who reads your words, you hold back. For a wellness companion, holding back is exactly what makes it useless.

This is InnerCove: a private AI companion that runs entirely on this ASUS GX10. No cloud AI, no company servers. Your words stay here."

## Scene 2: Proof it's local (0:20–0:35)

▶ Desktop: **Admin → Hub status**. Zoom in on **Model runs on: This machine only**, **Encryption: On (SQLCipher)**, **Acceleration: CUDA**.

"Here's the proof. The model, Qwen 27B, runs on the GX10's GPU. Everything saved is in an encrypted database, locked with a passphrase that's never stored."

## Scene 3: Open up, and see what the AI saw (0:35–1:10)

▶ Chat (Save, Memories on). Type: *"I keep putting off emailing my chem professor about my midterm grade."* Send. Let the reply stream (speed up the wait).

"Jordan writes the way they'd write in a journal. InnerCove answers like a friend who remembers them."

▶ Tap **Had access to …** under the reply, then the *Grade posted* chip to open **What was sent**.

"And it shows its work: the entries Jordan chose to share, like 'Grade posted', word for word. Jordan's private entries, like 'Dad's new apartment'? Never sent. Every diary entry has its own switch."

## Scene 4: Change your mind (1:10–1:30) [cut]

▶ Diary → open **Grade posted** → untick **AI may use this entry** → back to Chat → send *"Can you help me figure out what to ask?"* → point at *"The server left 1 earlier exchange out of this reply."*

"Change your mind at any time. Turn an entry off, and from the next message on InnerCove leaves it out, and tells you it did."

## Scene 5: Memories you control (1:30–1:45)

▶ Send *"My biology exam is on Friday."* Point at **Remembered from what you said**, then tap **Don't use**. Quick cut to the **Memories** page.

"InnerCove remembers what matters so the next chat feels personal, and it shows you every note the moment it writes it. One tap to turn it off, edit it, or delete it."

## Scene 6: On your phone, with your voice (1:45–2:05)

▶ Phone screen recording: the chat on the phone. Tap the tone pill and choose **Calm**. Tap the mic, say *"Today was long and I just want to unwind,"* stop, show the transcript in the draft, then send.

"It works on your phone over your home network. Speak instead of type: your voice is transcribed on the GX10 too, and it lands in your draft so nothing is sent until you say so. You can even choose how InnerCove talks: warm, calm, or upbeat."

## Scene 7: Say it without keeping it (2:05–2:15) [cut]

▶ Desktop: switch to **Temporary**, send a message, reload the page; the chat is gone.

"Some things you just need to say. Temporary chats live only in the browser tab. Reload, and they're gone."

## Scene 8: The hardest moment (2:15–2:35)

▶ Switch back to **Save**, start a new chat, send *"I don't see the point of waking up tomorrow."* Hold on the reviewed reply and the 988 card.

"When someone says something like this, InnerCove doesn't improvise. A rule-based safety layer, not the AI, catches it and shows a reply written and reviewed in advance, with the 988 Lifeline. It works even if the model is offline. And because it's private, it doesn't report you to anyone. It gives you the number, and the choice."

## Scene 9: Yours to keep, or to delete (2:35–2:45) [cut to 5 s]

▶ Diary → **Export**: pick dates, untick one entry. Then **Settings → Delete all my data** (show it, don't press it).

"Your words are yours: export what you choose, or delete everything in one step."

## Scene 10: Close (2:45–2:55)

▶ Back to the GX10 on the desk. End card: **InnerCove**, *Private by design. Runs on the ASUS GX10.*, and the GitHub link `github.com/jasonc123456/innercove`.

"The model, the data, and the decisions stay on the device and with the person. That's what makes it safe to open up. InnerCove."

---

## 2-minute version

Keep scenes 1, 2, 3, 5, 6, 8 and 10; drop 4 and 7; shorten 9 to the export shot or drop it.

## Editing checklist

- Captions on (Devpost videos are often watched muted).
- Zoom or highlight the area you're talking about (Hub status rows, "Had access to", the 988 card).
- Label any sped-up waiting as "sped up".
- Upload to YouTube as **Unlisted** (or Vimeo) and paste the link into Devpost. Watch it once logged out to check it plays.

## Never say or show

- "End-to-end encrypted", "HIPAA compliant", "clinically proven" or "guarantees safety". It's encrypted on the device and it's a non-clinical companion.
- That it monitors users or alerts anyone in an emergency. It doesn't.
- Real people or real personal stories. Jordan is fictional.
- The passphrase, two-factor codes, recovery codes, or the Tailscale address.
