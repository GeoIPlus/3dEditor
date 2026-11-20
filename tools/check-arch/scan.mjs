// File walking and source parsing for check:arch (3D-05). Uses the TypeScript parser, so comments and strings never
// produce false findings.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep, extname } from 'node:path';
import ts from 'typescript';

/**
 * Repository-relative POSIX paths of all files under `root`, skipping `skipDirs`.
 * @param {string} root
 * @param {string[]} skipDirs
 * @param {string} [dir]
 * @returns {string[]}
 */
export function walk(root, skipDirs, dir = root) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (skipDirs.includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(root, skipDirs, full));
    else out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}

/**
 * @param {string} file repository-relative path
 * @param {string[]} extensions
 */
export function isCode(file, extensions) {
  return extensions.includes(extname(file)) && !file.endsWith('.d.ts');
}

/** @param {string} text */
export function lineCount(text) {
  if (text === '') return 0;
  const n = text.split('\n').length;
  return text.endsWith('\n') ? n - 1 : n;
}

/** @param {string} file */
function scriptKind(file) {
  const ext = extname(file);
  if (ext === '.tsx' || ext === '.jsx') return ts.ScriptKind.TSX;
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/**
 * @typedef {{specifier: string, line: number}} ImportRef
 * @typedef {{name: string, line: number}} GlobalRef
 * @typedef {{imports: ImportRef[], identifiers: GlobalRef[]}} Parsed
 */

/**
 * Module specifiers (static/dynamic import, export-from, require) and identifier references of a source file.
 * Identifiers exclude property names (`a.document`) unless the object is a global alias (`globalThis.document`).
 * @param {string} file
 * @param {string} text
 * @returns {Parsed}
 */
export function parseSource(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  /** @type {ImportRef[]} */
  const imports = [];
  /** @type {GlobalRef[]} */
  const identifiers = [];
  /** @param {ts.Node} node */
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  /** @param {ts.Node} node */
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push({ specifier: node.moduleSpecifier.text, line: lineOf(node) });
    } else if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteralLike(node.arguments[0])) {
      const callee = node.expression;
      const isImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(callee) && callee.text === 'require';
      if (isImport || isRequire) imports.push({ specifier: node.arguments[0].text, line: lineOf(node) });
    } else if (ts.isIdentifier(node) && isReference(node)) {
      identifiers.push({ name: node.text, line: lineOf(node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { imports, identifiers };
}

const GLOBAL_ALIASES = new Set(['globalThis', 'window', 'self', 'global']);

/** @param {ts.Identifier} node */
function isReference(node) {
  const p = node.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === node) {
    return ts.isIdentifier(p.expression) && GLOBAL_ALIASES.has(p.expression.text);
  }
  if (ts.isQualifiedName(p) && p.right === node) return false;
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) ||
    ts.isPropertySignature(p) || ts.isMethodSignature(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p) ||
    ts.isEnumMember(p)) && p.name === node) return false;
  if ((ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) && p.propertyName === node) return false;
  if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) return false;
  return true;
}

/**
 * Read a file as UTF-8 text; `null` for binary content (contains NUL).
 * @param {string} full
 */
export function readText(full) {
  const buf = readFileSync(full);
  if (buf.includes(0)) return null;
  return buf.toString('utf8');
}
