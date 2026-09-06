import ts from "typescript";
import type { DetectorPlugin, FileContext, ManifestFragment, ClassFragment } from "./types.js";
import {
  getJSDocInfo,
  getNodeTypeText,
  getParsedTypeText,
  getParsedTypeTextFromType,
  resolveParsedTypeFromText,
  parseCemClassTags,
  parseCemMemberTags,
} from "@cem-generator/core-utils";

export function vanillaBuiltin(): DetectorPlugin {
  return {
    name: "vanilla",

    claims(sourceText) {
      return sourceText.includes("HTMLElement") || sourceText.includes("customElements.define");
    },

    onFile(context: FileContext): ManifestFragment {
      const fragment: ManifestFragment = {};
      const tagNamesByClass = collectDefineCalls(context.sourceFile);

      ts.forEachChild(context.sourceFile, function visit(node) {
        if (ts.isClassDeclaration(node) && node.name) {
          const className = node.name.text;
          const shouldInclude = extendsHTMLElement(node) || tagNamesByClass.has(className);
          if (!shouldInclude) {
            ts.forEachChild(node, visit);
            return;
          }
          const jsdoc = getJSDocInfo(node);
          const classDoc = parseCemClassTags(node);

          const classFragment: ClassFragment = {
            name: className,
            exportName: getExportName(node),
            module: context.filePath,
            description: jsdoc.description || undefined,
            summary: classDoc.summary,
            deprecated: classDoc.deprecated,
            tagName: classDoc.tagName ?? tagNamesByClass.get(className),
            superclass: getSuperclassRef(node),
            attributes: mergeByName(
              getObservedAttributes(node).map((name) => ({ name })),
              classDoc.attributes
            ),
            members: getPublicMembers(node, context),
            slots: mergeSlots(discoverSlotsFromNode(context.sourceFile, node), classDoc.slots),
            cssProperties: mergeCssProperties(discoverCssPropertiesFromNode(context.sourceFile, node), classDoc.cssProperties),
            cssParts: mergeCssParts(discoverCssPartsFromNode(context.sourceFile, node), classDoc.cssParts),
            cssStates: mergeCssStates(discoverCssStatesFromClass(node), classDoc.cssStates),
            omitInherited: classDoc.omitInherited,
            customJsDocTags: classDoc.customJsDocTags,
            events: classDoc.events?.map((event) => ({
              ...event,
              parsedType: resolveParsedTypeFromText(event.type, context.sourceFile, context.checker),
            })),
          };

          for (const attr of classFragment.attributes ?? []) {
            attr.parsedType = resolveParsedTypeFromText(attr.type, context.sourceFile, context.checker);
          }

          applyMemberToAttributeLinks(classFragment, classDoc, context);

          fragment[className] = classFragment;
        }
        ts.forEachChild(node, visit);
      });

      return fragment;
    },
  };
}

function getExportName(node: ts.ClassDeclaration): string | undefined {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (!modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return undefined;
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) return "default";
  return node.name?.text;
}

function extendsHTMLElement(node: ts.ClassDeclaration): boolean {
  if (!node.heritageClauses) return false;
  return node.heritageClauses.some((clause) =>
    clause.types.some((t) => t.expression.getText().match(/HTMLElement$/))
  );
}

function getSuperclassRef(node: ts.ClassDeclaration): ClassFragment["superclass"] {
  const clause = node.heritageClauses?.find((c) => c.token === ts.SyntaxKind.ExtendsKeyword);
  const heritageType = clause?.types[0];
  const expr = heritageType?.expression.getText();
  if (!expr || expr === "HTMLElement") return undefined;

  const className = extractSuperclassName(heritageType?.expression);
  if (!className) return { name: expr };

  const module = extractImportModuleForIdentifier(node.getSourceFile(), className);
  return { name: className, module };
}

function extractSuperclassName(expression: ts.Expression | undefined): string | undefined {
  if (!expression) return undefined;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return expression.getText();
}

function extractImportModuleForIdentifier(sourceFile: ts.SourceFile, identifier: string): string | undefined {
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const module = ts.isStringLiteral(stmt.moduleSpecifier) ? stmt.moduleSpecifier.text : undefined;
    if (!module) continue;

    const clause = stmt.importClause;
    if (!clause) continue;

    if (clause.name?.text === identifier) return module;

    const named = clause.namedBindings;
    if (named && ts.isNamedImports(named) && named.elements.some((el) => el.name.text === identifier)) {
      return module;
    }
  }
  return undefined;
}

function getObservedAttributes(node: ts.ClassDeclaration): string[] {
  for (const member of node.members) {
    const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
    const isObservedAttrs =
      (ts.isGetAccessorDeclaration(member) || ts.isPropertyDeclaration(member)) &&
      member.name.getText() === "observedAttributes" &&
      modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword);

    if (!isObservedAttrs) continue;

    let arrayLiteral: ts.ArrayLiteralExpression | undefined;
    if (ts.isGetAccessorDeclaration(member) && member.body) {
      const returnStmt = member.body.statements.find(ts.isReturnStatement);
      if (returnStmt?.expression && ts.isArrayLiteralExpression(returnStmt.expression)) {
        arrayLiteral = returnStmt.expression;
      }
    } else if (ts.isPropertyDeclaration(member) && member.initializer) {
      if (ts.isArrayLiteralExpression(member.initializer)) {
        arrayLiteral = member.initializer;
      }
    }

    if (arrayLiteral) {
      return arrayLiteral.elements
        .filter(ts.isStringLiteralLike)
        .map((el) => el.text);
    }
  }
  return [];
}

function getPublicMembers(node: ts.ClassDeclaration, context: FileContext): ClassFragment["members"] {
  const byName = new Map<string, NonNullable<ClassFragment["members"]>[number]>();

  for (const member of node.members) {
    const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
    const nameText = member.name?.getText();
    if (!nameText || nameText === "observedAttributes") continue;
    const privacy = nameText.startsWith("#") ? "private" : getPrivacy(modifiers);

    const jsdoc = getJSDocInfo(member);
    const existing = byName.get(nameText);
    const memberDoc = parseCemMemberTags(member);
    if (memberDoc.internal) continue;

    if (
      ts.isPropertyDeclaration(member) ||
      ts.isGetAccessorDeclaration(member) ||
      ts.isSetAccessorDeclaration(member)
    ) {
      const typeText = getNodeTypeText(member, context.checker);
      const parsedTypeText = getParsedTypeText(member, context.checker);
      byName.set(nameText, {
        name: nameText,
        kind: "field",
        description: jsdoc.description || existing?.description || undefined,
        summary: memberDoc.summary,
        deprecated: memberDoc.deprecated,
        privacy,
        static: isStatic(modifiers),
        readonly: isReadonly(member),
        type: typeText,
        parsedType: parsedTypeText && parsedTypeText !== typeText ? parsedTypeText : undefined,
        attribute:
          memberDoc.attribute ?? (memberDoc.attributeFromFieldName ? normalizeAttributeName(nameText) : undefined),
        reflects: memberDoc.reflects,
        internal: memberDoc.internal,
        default:
          memberDoc.default ??
          (ts.isPropertyDeclaration(member) ? member.initializer?.getText() : undefined),
        customJsDocTags: memberDoc.customJsDocTags,
      });
    } else if (ts.isMethodDeclaration(member) && !existing) {
      byName.set(nameText, {
        name: nameText,
        kind: "method",
        description: jsdoc.description || undefined,
        summary: memberDoc.summary,
        deprecated: memberDoc.deprecated,
        privacy,
        static: isStatic(modifiers),
        parameters: getMethodParameters(member, context),
        return: getMethodReturn(member, context),
        customJsDocTags: memberDoc.customJsDocTags,
      });
    }
  }
  return [...byName.values()];
}

function getMethodParameters(
  method: ts.MethodDeclaration,
  context: FileContext
): Array<{ name: string; type?: string; parsedType?: string; optional?: boolean; rest?: boolean; default?: string }> {
  return method.parameters.map((p) => {
    const typeText = getNodeTypeText(p, context.checker);
    const parsedTypeText = getParsedTypeText(p, context.checker);
    return {
      name: p.name.getText(),
      type: typeText,
      parsedType: parsedTypeText && parsedTypeText !== typeText ? parsedTypeText : undefined,
      optional: p.questionToken ? true : undefined,
      rest: p.dotDotDotToken ? true : undefined,
      default: p.initializer ? p.initializer.getText() : undefined,
    };
  });
}

function getMethodReturn(
  method: ts.MethodDeclaration,
  context: FileContext
): { type?: string; parsedType?: string; description?: string } | undefined {
  const type = getNodeTypeText(method, context.checker);
  if (!type) return undefined;
  let parsedType: string | undefined;
  try {
    const signature = context.checker.getSignatureFromDeclaration(method);
    const returnType = signature ? context.checker.getReturnTypeOfSignature(signature) : undefined;
    if (returnType) {
      const expanded = getParsedTypeTextFromType(returnType, context.checker);
      parsedType = expanded !== type ? expanded : undefined;
    }
  } catch {
    parsedType = undefined;
  }
  return { type, parsedType };
}

function isStatic(modifiers: readonly ts.Modifier[] | undefined): boolean | undefined {
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) ? true : undefined;
}

function getPrivacy(modifiers: readonly ts.Modifier[] | undefined): "public" | "private" | "protected" | undefined {
  if (!modifiers) return undefined;
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)) return "private";
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.ProtectedKeyword)) return "protected";
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.PublicKeyword)) return "public";
  return undefined;
}

function isReadonly(member: ts.ClassElement): boolean | undefined {
  if (!ts.isPropertyDeclaration(member)) return undefined;
  const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword) ? true : undefined;
}

function applyMemberToAttributeLinks(
  classFragment: ClassFragment,
  classDoc: { properties?: Array<{ name: string; description?: string; type?: string }> },
  context: FileContext
) {
  if (!classFragment.members?.length) return;

  const byName = new Map(classFragment.members.map((m) => [m.name, m]));

  for (const prop of classDoc.properties ?? []) {
    const existing = byName.get(prop.name);
    if (existing) {
      existing.description = existing.description ?? prop.description;
      existing.type = existing.type ?? prop.type;
      continue;
    }

    classFragment.members.push({
      name: prop.name,
      kind: "field",
      description: prop.description,
      type: prop.type,
    });
  }

  for (const member of classFragment.members) {
    const memberAny = member as Record<string, unknown>;
    const attribute = typeof memberAny.attribute === "string" ? memberAny.attribute : undefined;
    if (!attribute) continue;

    const attrName = attribute === "" ? normalizeAttributeName(member.name) : attribute;
    const attrs = (classFragment.attributes ??= []);
    let attr = attrs.find((a) => a.name === attrName);
    if (!attr) {
      attr = { name: attrName };
      attrs.push(attr);
    }
    attr.type = attr.type ?? (typeof memberAny.type === "string" ? memberAny.type : undefined);
    (attr as Record<string, unknown>).parsedType =
      (attr as Record<string, unknown>).parsedType ??
      (typeof memberAny.parsedType === "string" ? memberAny.parsedType : undefined);
    attr.description = attr.description ?? member.description;
    (attr as Record<string, unknown>).default =
      (attr as Record<string, unknown>).default ??
      (typeof memberAny.default === "string" ? memberAny.default : undefined);
    (attr as Record<string, unknown>).fieldName =
      (attr as Record<string, unknown>).fieldName ?? member.name;
  }

  for (const attr of classFragment.attributes ?? []) {
    const rec = attr as Record<string, unknown>;
    rec.parsedType =
      (typeof rec.parsedType === "string" ? rec.parsedType : undefined) ??
      resolveParsedTypeFromText(typeof rec.type === "string" ? rec.type : undefined, context.sourceFile, context.checker);
  }
}

function normalizeAttributeName(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function discoverSlotsFromNode(root: ts.Node, ownerClass?: ts.ClassDeclaration): ClassFragment["slots"] {
  const slots: Array<{ name: string; description?: string }> = [];
  const seenNames = new Set<string>();

  function visit(n: ts.Node) {
    if (
      ts.isClassDeclaration(n) &&
      ownerClass &&
      n !== ownerClass
    ) {
      return;
    }

    if (ts.isTemplateExpression(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const text = n.getText();
      const tokens = [
        ...[...text.matchAll(/<slot\b[^>]*>|<!--[\s\S]*?-->|<\/?[a-zA-Z][a-zA-Z0-9-]*[^>]*>/g)].map((m) => ({
          index: m.index,
          value: m[0],
          isSlot: m[0].startsWith("<slot"),
          isComment: m[0].startsWith("<!--"),
        })),
      ].sort((a, b) => a.index - b.index);

      let pendingDescription: string | undefined;
      for (const token of tokens) {
        if (token.isSlot) {
          const fullTag = token.value;
          const attrs = fullTag.replace(/^<slot\b/, "").replace(/>$/, "");

          const nameMatch = attrs.match(/\bname="([^"]*)"/i) ?? attrs.match(/\bname='([^']*)'/i);
          const slotName = nameMatch?.[1] ?? "";

          if (!seenNames.has(slotName)) {
            seenNames.add(slotName);
            slots.push({ name: slotName, description: pendingDescription });
          }
          pendingDescription = undefined;
        } else if (token.isComment) {
          pendingDescription = token.value.replace(/^<!--/, "").replace(/-->$/, "").trim() || undefined;
        } else {
          pendingDescription = undefined;
        }
      }
    }

    ts.forEachChild(n, visit);
  }

  ts.forEachChild(root, visit);
  return slots.length ? slots : undefined;
}

function mergeSlots(
  discovered: ClassFragment["slots"],
  jsdoc: ClassFragment["slots"]
): ClassFragment["slots"] {
  if (!discovered && !jsdoc) return undefined;
  if (!jsdoc) return discovered;
  if (!discovered) return jsdoc;

  const byName = new Map(discovered.map((s) => [s.name, { ...s }]));
  for (const slot of jsdoc) {
    byName.set(slot.name, slot);
  }
  return [...byName.values()];
}

function mergeByName<T extends { name: string }>(
  first: T[] | undefined,
  second: T[] | undefined
): T[] | undefined {
  const merged = new Map<string, T>();
  for (const item of first ?? []) merged.set(item.name, item);
  for (const item of second ?? []) merged.set(item.name, item);
  return merged.size ? [...merged.values()] : undefined;
}

function discoverCssPropertiesFromNode(
  root: ts.Node,
  ownerClass?: ts.ClassDeclaration
): ClassFragment["cssProperties"] {
  const byName = new Map<string, NonNullable<ClassFragment["cssProperties"]>[number]>();

  function visit(n: ts.Node) {
    if (
      ts.isClassDeclaration(n) &&
      ownerClass &&
      n !== ownerClass
    ) {
      return;
    }

    if (ts.isTemplateExpression(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const text = n.getText();

      const hostBlocks = [...text.matchAll(/:host(?:\([^)]*\))?\s*\{([\s\S]*?)\}/g)];
      for (const block of hostBlocks) {
        const declarations = [
          ...(block[1] ?? "").matchAll(
            /\/\*\*?([^{}]*?)\*\/\s*(--[a-zA-Z0-9-]+)\s*:\s*([^;}{]+)\s*;/g
          ),
        ];
        for (const [, jsdocComment, name, defaultValue] of declarations) {
          if (byName.has(name)) continue;
          byName.set(name, {
            name,
            default: defaultValue.trim() || undefined,
            description: parseCssComment(jsdocComment),
          });
        }
      }

      const propertyRules = [
        ...text.matchAll(
          /(?:\/\*\*?([^{}]*?)\*\/\s*)?@property\s+(--[a-zA-Z0-9-]+)\s*\{([\s\S]*?)\}/g
        ),
      ];
      for (const [, jsdocComment, name, body] of propertyRules) {
        const syntax = extractCssDeclarationValue(body, "syntax");
        const initialValue = extractCssDeclarationValue(body, "initial-value");
        const cleanedSyntax = stripCssQuotes(syntax?.trim());
        const entry = byName.get(name) ?? { name };
        byName.set(name, {
          ...entry,
          syntax: cleanedSyntax ?? entry.syntax,
          default: initialValue?.trim() || entry.default,
          description: parseCssComment(jsdocComment) ?? entry.description,
        });
      }
    }

    ts.forEachChild(n, visit);
  }

  ts.forEachChild(root, visit);
  return byName.size ? [...byName.values()] : undefined;
}

function extractCssDeclarationValue(block: string, propertyName: string): string | undefined {
  const match = block.match(new RegExp(`${propertyName}\\s*:\\s*([^;]+)\\s*;`));
  return match?.[1];
}

function stripCssQuotes(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseCssComment(rawComment: string | undefined): string | undefined {
  if (!rawComment) return undefined;
  const text = rawComment
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, ""))
    .join("\n")
    .trim();
  return text || undefined;
}

function mergeCssProperties(
  discovered: ClassFragment["cssProperties"],
  jsdoc: ClassFragment["cssProperties"]
): ClassFragment["cssProperties"] {
  if (!discovered && !jsdoc) return undefined;
  if (!jsdoc) return discovered;
  if (!discovered) return jsdoc;

  const byName = new Map(discovered.map((p) => [p.name, { ...p }]));
  for (const prop of jsdoc) {
    byName.set(prop.name, { ...byName.get(prop.name), ...prop });
  }
  return [...byName.values()];
}

function discoverCssPartsFromNode(
  root: ts.Node,
  ownerClass?: ts.ClassDeclaration
): ClassFragment["cssParts"] {
  const byName = new Map<string, NonNullable<ClassFragment["cssParts"]>[number]>();

  function visit(n: ts.Node) {
    if (
      ts.isClassDeclaration(n) &&
      ownerClass &&
      n !== ownerClass
    ) {
      return;
    }

    if (ts.isTemplateExpression(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const text = n.getText();

      const attrMatches = [...text.matchAll(/\bpart\s*=\s*(["'])([^"']+)\1/g)];
      for (const [, , rawValue] of attrMatches) {
        for (const token of rawValue.split(/\s+/).map((v) => v.trim()).filter(Boolean)) {
          if (!byName.has(token)) byName.set(token, { name: token });
        }
      }

      const commentedParts = [
        ...text.matchAll(/<!--([^<]*?)-->\s*<[^>]*\bpart\s*=\s*(["'])([^"']+)\2[^>]*>/g),
      ];
      for (const [, rawComment, , rawValue] of commentedParts) {
        const description = parseTemplateComment(rawComment);
        if (!description) continue;
        for (const token of rawValue.split(/\s+/).map((v) => v.trim()).filter(Boolean)) {
          const existing = byName.get(token);
          if (!existing) continue;
          if (!existing.description) existing.description = description;
        }
      }
    }

    ts.forEachChild(n, visit);
  }

  ts.forEachChild(root, visit);
  return byName.size ? [...byName.values()] : undefined;
}

function parseTemplateComment(rawComment: string | undefined): string | undefined {
  if (!rawComment) return undefined;
  const text = rawComment
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, ""))
    .join("\n")
    .trim();
  return text || undefined;
}

function mergeCssParts(
  discovered: ClassFragment["cssParts"],
  jsdoc: ClassFragment["cssParts"]
): ClassFragment["cssParts"] {
  if (!discovered && !jsdoc) return undefined;
  if (!jsdoc) return discovered;
  if (!discovered) return jsdoc;

  const byName = new Map(discovered.map((p) => [p.name, { ...p }]));
  for (const part of jsdoc) {
    byName.set(part.name, { ...byName.get(part.name), ...part });
  }
  return [...byName.values()];
}

function discoverCssStatesFromClass(node: ts.ClassDeclaration): ClassFragment["cssStates"] {
  const byName = new Map<string, NonNullable<ClassFragment["cssStates"]>[number]>();

  function visit(n: ts.Node) {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "add" &&
      ts.isPropertyAccessExpression(n.expression.expression) &&
      n.expression.expression.name.text === "states"
    ) {
      const arg = n.arguments[0];
      if (arg && ts.isStringLiteralLike(arg) && !byName.has(arg.text)) {
        byName.set(arg.text, { name: arg.text });
      }
    }

    ts.forEachChild(n, visit);
  }

  ts.forEachChild(node, visit);
  return byName.size ? [...byName.values()] : undefined;
}

function mergeCssStates(
  discovered: ClassFragment["cssStates"],
  jsdoc: ClassFragment["cssStates"]
): ClassFragment["cssStates"] {
  if (!discovered && !jsdoc) return undefined;
  if (!jsdoc) return discovered;
  if (!discovered) return jsdoc;

  const byName = new Map(discovered.map((s) => [s.name, { ...s }]));
  for (const state of jsdoc) {
    byName.set(state.name, { ...byName.get(state.name), ...state });
  }
  return [...byName.values()];
}

function collectDefineCalls(sourceFile: ts.SourceFile): Map<string, string> {
  const result = new Map<string, string>();

  ts.forEachChild(sourceFile, function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText() === "customElements" &&
      node.expression.name.text === "define"
    ) {
      const [tagArg, classArg] = node.arguments;
      if (tagArg && ts.isStringLiteralLike(tagArg) && classArg && ts.isIdentifier(classArg)) {
        result.set(classArg.text, tagArg.text);
      }
    }
    ts.forEachChild(node, visit);
  });

  return result;
}
