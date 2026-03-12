import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, "..");
const supportedExtensions = [".ts", ".tsx", ".js", ".mjs"];

const resolveFileCandidate = (basePath) => {
  if (existsSync(basePath) && statSync(basePath).isFile()) {
    return basePath;
  }

  for (const extension of supportedExtensions) {
    const candidate = `${basePath}${extension}`;
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  for (const extension of supportedExtensions) {
    const indexCandidate = path.join(basePath, `index${extension}`);
    if (existsSync(indexCandidate)) {
      return indexCandidate;
    }
  }

  return null;
};

const resolveAliasSpecifier = (specifier) =>
  resolveFileCandidate(path.join(repoRoot, specifier.slice(2)));

const resolveRelativeSpecifier = (specifier, parentURL) => {
  if (!parentURL?.startsWith("file:")) {
    return null;
  }

  const parentPath = fileURLToPath(parentURL);
  return resolveFileCandidate(path.resolve(path.dirname(parentPath), specifier));
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const resolved = resolveAliasSpecifier(specifier);
      if (!resolved) {
        throw new Error(`Could not resolve alias import: ${specifier}`);
      }

      return {
        shortCircuit: true,
        url: pathToFileURL(resolved).href,
      };
    }

    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      const resolved = resolveRelativeSpecifier(specifier, context.parentURL);
      if (resolved) {
        return {
          shortCircuit: true,
          url: pathToFileURL(resolved).href,
        };
      }
    }

    return nextResolve(specifier, context);
  },

  load(url, context, nextLoad) {
    if (url.startsWith("file:") && (url.endsWith(".ts") || url.endsWith(".tsx"))) {
      const source = readFileSync(fileURLToPath(url), "utf8");

      return {
        format: "module",
        shortCircuit: true,
        source: stripTypeScriptTypes(source, {
          mode: "transform",
          sourceMap: false,
        }),
      };
    }

    return nextLoad(url, context);
  },
});
