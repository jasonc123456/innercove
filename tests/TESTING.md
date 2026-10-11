# InnerCove testing checklist

## Run now

From the repository root:

```sh
node scripts/check-safety.mjs
```

This checks each of the 30 approved safety inputs against the deterministic tier rules.

The encrypted-database integration test uses the standard `sqlite3` command-line tool to confirm a plaintext reader cannot open an encrypted diary file.

The output-screen cases are in `tests/output-screen-cases.json`. They run with the safety module (`packages/core/src/safety`, D44) in `packages/server/src/chat/rules-safety.test.ts` (`npm test`); they cover actionable method details, including euphemistic outcomes such as “end your life,” and diagnostic wording.

Prompt-quality re-evaluation: after changing `config/prompts/system-prompt.txt`, A runs all 40 `docs/prep/` prompts on the GX10 at Q6_K and records the score sheets. Review Tier-1 abuse/resource cases and context-discipline cases before accepting a new score; never report an unrun prompt change as an improved model result.

For the current frontend:

```sh
cd web
npm install
npm run build
npm run dev
```

Open the local URL Vite prints. Confirm a normal chat message streams in the mock interface.

## After the API is merged

1. Send all 30 messages in `tests/safety-cases.json` through `/api/chat`; each response must report its expected tier. (Automated in `rules-safety.test.ts` with `FakeProvider`; repeat once by hand against the real model.)
2. Stop the model and send a tier-2 message. Confirm the reviewed static reply and the crisis card still render.
3. Verify a planted method-detail response never appears in the browser.
4. Build the web app, run the server test suite, then run the offline demo in `docs/DEMO_SCRIPT.md`.
