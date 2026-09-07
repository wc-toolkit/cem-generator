import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GeneratorRunner, shouldTrigger } from "../dist/shared.js";

const here = path.dirname(fileURLToPath(import.meta.url));

test("triggers only for source/config changes and ignores its output", () => {
  assert.equal(shouldTrigger("src/button.ts"), true);
  assert.equal(shouldTrigger("cem-generator.config.ts"), true);
  assert.equal(shouldTrigger("custom-elements.json"), false);
  assert.equal(shouldTrigger("src/button.css"), false);
});

test("generates a manifest at the configured output path", async () => {
  const root = path.resolve(here, "../../core/tests/fixtures");
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "cem-generator-"));
  const outputPath = path.join(output, "nested", "custom-elements.json");

  try {
    const runner = new GeneratorRunner(root, {
      tsConfigPath: "tsconfig.json",
      output: outputPath,
    });
    await runner.run();

    const manifest = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(manifest.schemaVersion, "2.1.0");
    assert.ok(Array.isArray(manifest.modules));
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});
