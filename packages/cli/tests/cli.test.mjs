import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, "../dist/cli.js");

test("documents validation severity CLI options", () => {
  const result = spawnSync(process.execPath, [cliPath, "generate", "--help"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /--validate-exported-types <severity>/);
  assert.match(result.stdout, /--validation-invariants <severity>/);
});
