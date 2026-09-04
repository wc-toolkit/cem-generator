import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
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

const fileName = path.join(path.dirname(fileURLToPath(import.meta.url)), "demo-input.ts");
const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);

const program = ts.createProgram({
  rootNames: [fileName],
  options: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  host: {
    ...ts.createCompilerHost({}, true),
    getSourceFile: (name) => (name === fileName ? sourceFile : undefined),
    readFile: () => undefined,
    fileExists: (name) => name === fileName,
    writeFile: () => undefined,
  },
});

const checker = program.getTypeChecker();

let classNode;
for (const stmt of sourceFile.statements) {
  if (ts.isClassDeclaration(stmt)) {
    classNode = stmt;
    break;
  }
}

if (!classNode) {
  throw new Error("No class found in demo input");
}

const classTags = parseCemClassTags(classNode);
const modeMember = classNode.members.find((m) => ts.isPropertyDeclaration(m));
const runMember = classNode.members.find((m) => ts.isMethodDeclaration(m));

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
