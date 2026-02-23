import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function requireNodeSqlite(): typeof import("node:sqlite") {
  try {
    return require("node:sqlite") as typeof import("node:sqlite");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`P3 outbox requires node:sqlite support. ${message}`, { cause: error });
  }
}
