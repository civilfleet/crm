import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const children = [];
let shuttingDown = false;

function start(name, command, args) {
  const child = spawn(command, args, {
    env: {
      ...process.env,
      FORCE_COLOR: "1",
    },
    stdio: "inherit",
  });

  children.push(child);

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.error(
      `[dev] ${name} exited with ${reason}; stopping dev processes.`,
    );
    shutdown(code ?? 1);
  });

  child.on("error", (error) => {
    if (shuttingDown) {
      return;
    }

    console.error(`[dev] Failed to start ${name}:`, error);
    shutdown(1);
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (child.exitCode === null && !child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, 500).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start("web", process.execPath, [
  require.resolve("next/dist/bin/next"),
  "dev",
  "--turbopack",
]);
start("worker", process.execPath, [
  require.resolve("tsx/cli"),
  "scripts/background-worker.ts",
]);
