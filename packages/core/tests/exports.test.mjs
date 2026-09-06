import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../dist/pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(__dirname, "exports-fixture");
const tsConfigPath = path.join(fixtureRoot, "tsconfig.json");

test("preserves source and resolves exact and wildcard package exports", () => {
  const manifest = generateCem({
    tsConfigPath,
    plugins: [
      {
        name: "fixture-detector",
        claims: () => true,
        onFile(context) {
          if (context.filePath.endsWith("multi.ts")) {
            return {
              MultiFirstElement: { name: "MultiFirstElement", tagName: "multi-first" },
              MultiSecondElement: { name: "MultiSecondElement", tagName: "multi-second" },
            };
          }
          if (context.filePath.endsWith("legacy.ts")) {
            return { LegacyElement: { name: "LegacyElement", tagName: "legacy-element" } };
          }
          const name = context.filePath.endsWith("index.ts") ? "RootElement" : "ButtonElement";
          return {
            [name]: {
              name,
              tagName: name === "RootElement" ? "root-element" : "x-button",
              ...(name === "ButtonElement" ? { superclass: { name: "RootElement", module: path.join(fixtureRoot, "src/index.ts") } } : {}),
            },
          };
        },
      },
    ],
  });

  const root = manifest.modules.find((module) => module.source?.endsWith("/src/index.ts"));
  const button = manifest.modules.find((module) => module.source?.endsWith("/src/components/button.ts"));
  const legacy = manifest.modules.find((module) => module.source?.endsWith("/src/legacy.ts"));

  assert.equal(root?.path, "dist/index.js");
  assert.equal(button?.path, "dist/components/button.js");
  assert.equal(button?.declarations?.[0]?.superclass?.module, "dist/index.js");
  assert.equal(legacy?.path, "dist/legacy.js");
  assert.ok(root?.source?.endsWith("/src/index.ts"));
  assert.ok(button?.source?.endsWith("/src/components/button.ts"));
  assert.equal(root?.exports?.[0]?.declaration.module, "dist/index.js");
  assert.equal(button?.exports?.[0]?.declaration.module, "dist/components/button.js");
});

test("supports configurable module, definition, and type paths", () => {
  const manifest = generateCem({
    tsConfigPath,
    modulePathResolver: {
      modulePathTemplate: (_path, name, tagName) => `./published//${tagName}/${name}.js`,
      definitionPathTemplate: (_path, _name, tagName) => `./published//${tagName}/index.js`,
      typeDefinitionPathTemplate: (_path, _name, tagName) => `./types//${tagName}.d.ts`,
    },
    plugins: [
      {
        name: "fixture-detector",
        claims: () => true,
        onFile(context) {
          if (context.filePath.endsWith("multi.ts")) {
            return {
              MultiFirstElement: { name: "MultiFirstElement", tagName: "multi-first" },
              MultiSecondElement: { name: "MultiSecondElement", tagName: "multi-second" },
            };
          }
          const name = context.filePath.endsWith("index.ts") ? "RootElement" : "ButtonElement";
          return { [name]: { name, tagName: name === "RootElement" ? "root-element" : "x-button" } };
        },
      },
    ],
  });

  const button = manifest.modules.find((module) => module.source?.endsWith("/src/components/button.ts"));
  const multi = manifest.modules.find((module) => module.source?.endsWith("/src/components/multi.ts"));
  const definition = manifest.modules.find((module) => module.path === "./published/x-button/index.js");

  assert.equal(button?.path, "./published/x-button/ButtonElement.js");
  assert.equal(button?.typeDefinitionPath, "./types/x-button.d.ts");
  assert.equal(definition?.exports?.[0]?.declaration.module, "./published/x-button/ButtonElement.js");
  assert.equal(multi?.path, "./published/multi-first/MultiFirstElement.js");
});
