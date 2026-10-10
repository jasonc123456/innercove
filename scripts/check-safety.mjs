import { readFile } from "node:fs/promises";

const rules = JSON.parse(
  await readFile(new URL("../config/safety-rules.json", import.meta.url), "utf8"),
).rules;
const cases = JSON.parse(
  await readFile(new URL("../tests/safety-cases.json", import.meta.url), "utf8"),
);

function tierFor(text) {
  const matches = rules.filter(
    (rule) =>
      rule.patterns.some((pattern) => new RegExp(pattern, "i").test(text)) &&
      !rule.excludePatterns?.some((pattern) =>
        new RegExp(pattern, "i").test(text),
      ),
  );

  return matches.length === 0 ? 0 : Math.max(...matches.map((rule) => rule.tier));
}

const failures = cases.filter((testCase) =>
  tierFor(testCase.text) !== testCase.expectedTier,
);

if (failures.length > 0) {
  for (const testCase of failures) {
    console.error(
      `${testCase.id}: expected tier ${testCase.expectedTier}, got ${tierFor(testCase.text)}`,
    );
  }
  process.exitCode = 1;
} else {
  console.log(`Safety checks passed: ${cases.length}/${cases.length} cases.`);
}
