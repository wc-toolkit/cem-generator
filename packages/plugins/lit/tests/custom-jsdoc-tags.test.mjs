import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../../../core/dist/pipeline.js";
import { litPlugin } from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

test("emits custom JSDoc tags on Lit class declarations", () => {
  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    plugins: [litPlugin()],
    customJsDocTags: true,
  });
  const declaration = manifest.modules
    .flatMap((module) => module.declarations)
    .find((item) => item.name === "CustomJsDocTagsElement");

  assert.ok(declaration, "Expected CustomJsDocTagsElement declaration");
  assert.deepEqual(declaration.owner, { name: "design-system" });
});
