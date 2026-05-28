declare module "pg-copy-streams" {
  import type { Writable } from "node:stream";

  export const from: (query: string) => Writable;
}
