import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as is from "typescript/ast/is";
import { API } from "typescript/sync";
import { parseCemClassTags, parseCemMemberTags, getNodeTypeText } from "../src/index.ts";

const source = `
/**
 * Demo element
 * @summary Utility parser demo
 * @tag demo-el
 * @cssprop --demo-color - Demo color token
 */
class DemoEl extends HTMLElement {
  /** @attribute @default primary */
  mode = "primary";

  /** @summary Execute action */
  run(count = 1) { return count; }
}
`;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cem-core-utils-demo-"));
const fileName = path.join(tempDir, "demo-input.ts");
fs.writeFileSync(fileName, source);

const api = new API();
try {
  const program = api.createProgram([fileName], { target: 9, module: 7, lib: ["lib.es2022.d.ts"] });
  const checker = program.getProject().checker;
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) {
    throw new Error("Demo input was not added to the program");
  }

  let classNode;
  for (const stmt of sourceFile.statements) {
    if (is.isClassDeclaration(stmt)) {
      classNode = stmt;
      break;
    }
  }

  if (!classNode) {
    throw new Error("No class found in demo input");
  }

  const classTags = parseCemClassTags(classNode);
  const modeMember = classNode.members.find((m) => is.isPropertyDeclaration(m));
  const runMember = classNode.members.find((m) => is.isMethodDeclaration(m));

  const output = {
    classTags,
    mode: modeMember
      ? {
          tags: parseCemMemberTags(modeMember),
          type: getNodeTypeText(modeMember, checker),
        }
      : undefined,
    run: runMember
      ? {
          tags: parseCemMemberTags(runMember),
          type: getNodeTypeText(runMember, checker),
        }
      : undefined,
  };

  console.log(JSON.stringify(output, null, 2));
} finally {
  api.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
