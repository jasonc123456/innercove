# InnerCove testing checklist

## Run now

From the repository root:

```sh
node scripts/check-safety.mjs
```

This checks each of the 30 approved safety inputs against the deterministic tier rules.

For the current frontend:

```sh
cd web
npm install
npm run build
npm run dev
```

Open the local URL Vite prints. Confirm a normal chat message streams in the mock interface.

## After the API is merged

1. Send all 30 messages in `tests/safety-cases.json` through `/api/chat`; each response must report its expected tier.
2. Stop the model and send a tier-2 message. Confirm the reviewed static reply and the crisis card still render.
3. Verify a planted method-detail response never appears in the browser.
4. Build the web app, run the server test suite, then run the offline demo in `docs/DEMO_SCRIPT.md`.
