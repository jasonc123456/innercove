# InnerCove demo runbook

For the spoken talk track for judges (privacy and local hosting), see [JUDGE_DEMO_SCRIPT.md](JUDGE_DEMO_SCRIPT.md). For the recorded Devpost video, see [VIDEO_DEMO_SCRIPT.md](VIDEO_DEMO_SCRIPT.md). To read aloud word for word, see [READ_ALOUD_SCRIPT.md](READ_ALOUD_SCRIPT.md).

Use the fictional Jordan persona only. Start with the network connected and the app unlocked.

1. Add **Office hours tomorrow** and allow AI access. Add **Thinking about switching majors** and leave AI access off.
2. In a saved chat, send: “I'm nervous about tomorrow and kind of rethinking everything about school.”
3. Tap the collapsed **Had access to …** line under the reply; it names only *Office hours tomorrow*. Open it to show exactly what was sent; the private entry must not appear.
4. Revoke AI access to *Office hours tomorrow*. Send another message and show the revocation notice: the next prompt and relevant visible history no longer include that entry.
5. Point to the privacy panel's model endpoint (loopback) to show inference never leaves the GX10. (The unplugged-network moment is descoped for the event; only if the team re-enables it: unplug the router's uplink and keep chatting.)
6. Start a temporary chat, enter a message, reload, and show that it has disappeared with no stored chat.
7. With the model stopped, send: “I don't see the point of waking up tomorrow.” Show the reviewed reply and 988 crisis card. Do not use a real person’s content.
8. Save an excerpt to the diary, then use **Delete everything**. Confirm the canary text is absent from the unlocked database, search, and next assembled prompt.
9. Memories (D49): in a saved chat, say something lasting ("My biology exam is on Friday"). Show the "Remembered from what you said" card under the reply, then tap "Don't use" and open Memories: InnerCove's notes about you, each with "AI may use this" and delete. Never health details: it doesn't note them.
10. Finish on the privacy panel: local model, local data, encryption status, and loopback-only ports.

## Presenter reminders

- Say “no third-party AI provider” and “local data handling”; do not claim end-to-end encryption or clinical care.
- Never promise that the safety layer guarantees safety; explain that it uses deterministic screening and reviewed emergency replies.
- If the network moment fails, proceed directly to the crisis-card and privacy-panel moments.
