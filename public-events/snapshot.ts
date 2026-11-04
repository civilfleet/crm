import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PublicSnapshot } from "../src/lib/public-events/types";

export function snapshot(): PublicSnapshot {
  return JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        process.cwd().endsWith("public-events")
          ? ".snapshot.json"
          : "public-events/.snapshot.json",
      ),
      "utf8",
    ),
  );
}
