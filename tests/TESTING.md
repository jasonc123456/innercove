# InnerCove testing checklist

## Run now

From the repository root:

```sh
node scripts/check-safety.mjs
```

This checks each approved safety input against the deterministic tier rules.

The encrypted-database integration test uses the standard `sqlite3` command-line tool to confirm a plaintext reader cannot open an encrypted diary file.

The output-screen cases are in `tests/output-screen-cases.json`. They run with the safety module (`packages/core/src/safety`, D44) in `packages/server/src/chat/rules-safety.test.ts` (`npm test`); they cover actionable method details, diagnostic wording, unsafe medication directions, false emergency-contact claims, professional impersonation, dependency language, and unsupported clinical certainty. The suite also verifies that a missing or failing safety layer never falls back to model generation.

Prompt-quality re-evaluation: after changing `config/prompts/system-prompt.txt`, A runs all 40 `docs/prep/` prompts on the GX10 at Q6_K and records the score sheets. Review Tier-1 abuse/resource cases and context-discipline cases before accepting a new score; never report an unrun prompt change as an improved model result.

Trauma-informed prompt review: also run the cases in `tests/trauma-informed-cases.json`. A passing reply is warm and concise, uses no diagnosis or clinical score, does not claim to save or infer a condition, gives the person control over pace, and asks no more than one gentle question. These are behavior-review cases, not diagnostic tests or clinical advice.

## Prototype safety coverage

Automated, deterministic coverage is deliberately split across the safety-rule, output-screen, and pipeline tests:

| Requirement scenario | Coverage |
| --- | --- |
| Everyday stress; sadness/loneliness; ambiguous distress | `S31` and `S32` in `tests/safety-cases.json` remain tier 0, so supportive generation is available without falsely escalating. |
| Diagnosis request | The deployed prompt's non-diagnostic and single-question rules are asserted in `rules-safety.test.ts`; `T01` is reviewed against the real model. |
| Medication request | `S33` is tier 1; `O06` blocks a model instruction to change medication. |
| Self-harm; imminent crisis; harm to others | Tier-1/tier-2 cases `S01`–`S22` and reviewed static reply integration checks. |
| Harmful prompt injection | `packages/server/src/chat/phase3.test.ts` verifies retrieved text cannot forge prompt delimiters or instructions. |
| Unsafe model reply | `O02`–`O10`, including self-harm method detail, diagnoses, medical directions, impersonation, dependency, and false emergency-contact claims. |
| LLM provider failure | `packages/server/src/app.test.ts` asserts `MODEL_UNAVAILABLE` is emitted rather than inventing a reply. |
| Safety service/configuration failure | `rules-safety.test.ts` asserts missing config fails startup and a throwing assessment sends no model prompt. |
| User memory disabled | `packages/server/src/api/memories.test.ts` verifies a temporary/no-memory chat sends no stored memory and writes no content. |

The test suite does **not** certify clinical safety or prove an LLM will always follow an instruction. Before a demo, A must run the trauma-informed cases and the full prompt set on the GX10 model, inspect the replies, and record any failures rather than claiming validation.

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
