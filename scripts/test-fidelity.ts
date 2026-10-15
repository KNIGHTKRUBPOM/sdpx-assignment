import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const file = "src/domain/scoring.ts";
const original = await readFile(file, "utf8");
const changed = original.replace(".div(5);", ".div(4);");
if (changed === original) throw new Error("Scoring mutation anchor missing");
const test = () =>
  spawnSync(
    process.execPath,
    ["node_modules/vitest/vitest.mjs", "run", "tests/pilot-core.test.ts"],
    { encoding: "utf8", windowsHide: true },
  );
try {
  await writeFile(file, changed);
  const result = test();
  if (result.status === 0 || !result.stdout.includes("failed"))
    throw new Error(
      "Golden regression did not detect the deliberate scoring defect",
    );
  console.log(
    "PASS: changing the 6-point divisor from 5 to 4 makes the golden regression fail",
  );
} finally {
  await writeFile(file, original);
}
const restored = test();
if (restored.status !== 0) throw new Error("Restored source did not pass");
console.log(
  "PASS: original source restored and all 6 scoring/policy regressions pass",
);
