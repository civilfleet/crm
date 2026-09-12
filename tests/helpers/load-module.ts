import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const requireFromRepo = createRequire(path.join(root, "package.json"));

// Execute the real route/service with explicit boundary mocks, without DB or network access.
export function loadModule<T>(
  relative: string,
  mocks: Record<string, unknown>,
  globals: { Date?: unknown; Map?: unknown } = {},
): T {
  const code = ts.transpileModule(
    readFileSync(path.join(root, relative), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "Date", "Map", code)(
    (id: string) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith("@/") || id.startsWith("next/")) {
        throw new Error(`Missing test boundary: ${id}`);
      }
      return requireFromRepo(id);
    },
    module,
    module.exports,
    globals.Date ?? Date,
    globals.Map ?? Map,
  );
  return module.exports as T;
}
