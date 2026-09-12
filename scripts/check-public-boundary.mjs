import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../packages/shared/src');
const visited = new Set();
function visit(file) {
  if (visited.has(file)) return;
  visited.add(file);
  if (/\/games\/(?:[^/]+\/server|registry)\.ts$/.test(file)) throw new Error(`Browser entry reaches an authoritative engine: ${file}`);
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    if (ts.isImportDeclaration(node)) {
      if (node.importClause?.isTypeOnly) continue;
      const bindings = node.importClause?.namedBindings;
      if (!node.importClause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.every((element) => element.isTypeOnly)) continue;
    } else {
      if (node.isTypeOnly) continue;
      if (node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.every((element) => element.isTypeOnly)) continue;
    }
    const target = node.moduleSpecifier.text;
    if (target.startsWith('.')) visit(resolve(dirname(file), target.replace(/\.js$/, '.ts')));
    else if (target !== 'zod') throw new Error(`Unexpected browser contract dependency: ${target} in ${file}`);
  }
}
visit(resolve(root, 'public.ts'));
console.log(`Browser contract boundary verified across ${visited.size} modules.`);
