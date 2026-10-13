import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createGeneratorSession } from "../dist/session.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

test("reuses the generation session and supports watch lifecycle", async () => {
  const session = createGeneratorSession({ tsConfigPath: fixturesTsConfig });
  const first = session.generate();
  const second = session.generate();
  assert.deepEqual(second, first);

  let callbackCount = 0;
  const watch = session.watch({
    onManifest() {
      callbackCount += 1;
    },
  });
  await watch.ready;
  watch.close();
  assert.equal(callbackCount, 1);
});
