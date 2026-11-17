import * as ts from "typescript/ast";
import * as is from "typescript/ast/is";
import type { API, Checker, Type as TsType } from "typescript/sync";
import { primeTypeAtLocation } from "@wc-toolkit/cem-generator-utils";
import { primeMethodReturnType } from "./api-members.js";

type Requests = Generator<any, TsType | undefined, any>;

export interface PrefetchTarget {
  sourceFile: ts.SourceFile;
  /**
   * Whether every class in the file is a candidate. Framework plugins decide what to emit from
   * decorators, calls, and other syntax we cannot cheaply predict, so their files get the full
   * treatment; the built-in vanilla detector's candidates are predictable.
   */
  allClasses: boolean;
}

/**
 * Every checker query is a round trip to the compiler process, and detectors ask for member
 * types one at a time. Asking for them all in one batch replaces thousands of round trips
 * with a few, and primes the caches that `getNodeTypeText` and friends read from, so detectors
 * behave exactly as before and only get their answers sooner.
 *
 * This is purely an optimisation: anything not prefetched is still fetched on demand, and a
 * failure to prefetch a node is ignored.
 */
export function prefetchMemberTypes(api: API, checker: Checker, targets: PrefetchTarget[]): void {
  const typeNodes: ts.Node[] = [];
  const methods: ts.MethodDeclaration[] = [];

  const collectMember = (member: ts.ClassElement): void => {
    if (!(member as { name?: ts.Node }).name) return;
    if (
      is.isPropertyDeclaration(member) ||
      is.isGetAccessorDeclaration(member) ||
      is.isSetAccessorDeclaration(member)
    ) {
      typeNodes.push(member);
    } else if (is.isMethodDeclaration(member)) {
      methods.push(member);
      for (const parameter of member.parameters) typeNodes.push(parameter);
    }
  };

  for (const { sourceFile, allClasses } of targets) {
    // The vanilla detector only emits classes that extend something or are registered with
    // `customElements.define`, so unrelated plain classes are skipped. Registration can happen
    // anywhere in the file, so the file's text is the cheap test for it.
    const mayRegister = allClasses || sourceFile.getFullText().includes("customElements");

    sourceFile.forEachChild(function visit(node: ts.Node): void {
      if (is.isClassDeclaration(node) || is.isClassExpression(node)) {
        if (allClasses || mayRegister || hasExtendsClause(node)) {
          for (const member of node.members) collectMember(member);
        }
      }
      node.forEachChild(visit);
    });
  }

  if (typeNodes.length === 0 && methods.length === 0) return;

  function* typeAt(node: ts.Node): Requests {
    try {
      return yield* checker.getTypeAtLocation.gen(node);
    } catch {
      return undefined;
    }
  }

  function* returnTypeOf(method: ts.MethodDeclaration): Requests {
    try {
      const signature = yield* checker.getSignatureFromDeclaration.gen(method);
      return signature ? yield* checker.getReturnTypeOfSignature.gen(signature) : undefined;
    } catch {
      return undefined;
    }
  }

  try {
    const results = api.batch(
      ...typeNodes.map((node) => typeAt(node)),
      ...methods.map((method) => returnTypeOf(method)),
    ) as Array<TsType | undefined>;

    typeNodes.forEach((node, index) => {
      const type = results[index];
      if (type) primeTypeAtLocation(node, checker, type);
    });
    methods.forEach((method, index) => {
      const type = results[typeNodes.length + index];
      if (type) primeMethodReturnType(method, checker, type);
    });
  } catch {
    // Prefetching is best effort; detectors fall back to on-demand queries.
  }
}

/** Whether a class declares a base class, which is the only way vanilla detection can find one. */
function hasExtendsClause(node: ts.ClassDeclaration | ts.ClassExpression): boolean {
  return !!node.heritageClauses?.some((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword);
}
