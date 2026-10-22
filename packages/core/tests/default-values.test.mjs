import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../dist/pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

test("uses only exact literals for ordinary class field defaults", () => {
  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    include: ["default-values.ts"],
  });
  const declaration = manifest.modules
    .flatMap((module) => module.declarations)
    .find((item) => item.name === "DefaultValuesElement");

  assert.ok(declaration);
  const defaults = new Map(declaration.members?.map((member) => [member.name, member.default]));
  assert.equal(defaults.get("count"), "3");
  assert.equal(defaults.get("pageSize"), "10");
  assert.equal(defaults.get("mode"), '"compact"');
  assert.equal(defaults.get("enabled"), "false");
  assert.equal(defaults.get("nullable"), "null");
  assert.equal(defaults.get("templateText"), "`ready`");
  assert.equal(defaults.get("documented"), '"documented"');

  for (const name of ["values", "options", "createdAt", "computed", "mutable", "missing"]) {
    assert.equal(defaults.get(name), undefined, `${name} has no exact default`);
  }
});
