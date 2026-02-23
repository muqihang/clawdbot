import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { requireNodeSqlite } from "./sqlite.js";

export type SaveCheckpointInput = {
  taskId: string;
  intent: string;
  state: unknown;
  expectedOutcome: string;
  workingFiles: string[];
  ttlMs?: number;
};

export type RestoreCheckpointInput = {
  taskId: string;
};

export type CheckpointRecord = {
  checkpoint_id: number;
  task_id: string;
  intent: string;
  state: unknown;
  expected_outcome: string;
  working_files: string[];
  saved_at: string;
  expires_at: number;
};

export type CreateCheckpointStoreOptions = {
  dbPath: string;
  now?: () => number;
};

const DEFAULT_TTL_MS = 4 * 60 * 60 * 1000;

const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const ensureSchema = (db: DatabaseSync): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_checkpoints (
      checkpoint_id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      intent TEXT NOT NULL,
      state_json TEXT NOT NULL,
      expected_outcome TEXT NOT NULL,
      working_files_json TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_memory_checkpoints_task_saved
      ON memory_checkpoints(task_id, saved_at DESC);`,
  );
};

const mapRow = (row: Record<string, unknown>): CheckpointRecord => {
  return {
    checkpoint_id:
      typeof row.checkpoint_id === "number" && Number.isFinite(row.checkpoint_id)
        ? Math.floor(row.checkpoint_id)
        : 0,
    task_id: String(row.task_id ?? ""),
    intent: String(row.intent ?? ""),
    state: parseJson(row.state_json ? String(row.state_json) : "{}", {}),
    expected_outcome: String(row.expected_outcome ?? ""),
    working_files: parseJson<string[]>(
      row.working_files_json ? String(row.working_files_json) : "[]",
      [],
    ),
    saved_at: String(row.saved_at ?? ""),
    expires_at:
      typeof row.expires_at === "number" && Number.isFinite(row.expires_at)
        ? Math.floor(row.expires_at)
        : 0,
  };
};

export function createCheckpointStore(options: CreateCheckpointStoreOptions) {
  const now = options.now ?? Date.now;

  mkdirSync(path.dirname(options.dbPath), { recursive: true });
  const { DatabaseSync } = requireNodeSqlite();
  const db = new DatabaseSync(options.dbPath);
  ensureSchema(db);

  return {
    save(input: SaveCheckpointInput): CheckpointRecord {
      const savedAtMs = now();
      const savedAt = new Date(savedAtMs).toISOString();
      const ttlMs =
        typeof input.ttlMs === "number" && input.ttlMs > 0 ? input.ttlMs : DEFAULT_TTL_MS;
      const expiresAt = savedAtMs + Math.floor(ttlMs);

      db.prepare(
        `INSERT INTO memory_checkpoints(
           task_id,
           intent,
           state_json,
           expected_outcome,
           working_files_json,
           saved_at,
           expires_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.taskId,
        input.intent,
        JSON.stringify(input.state ?? {}),
        input.expectedOutcome,
        JSON.stringify(input.workingFiles ?? []),
        savedAt,
        expiresAt,
      );

      const row = db
        .prepare(`SELECT * FROM memory_checkpoints WHERE rowid = last_insert_rowid()`)
        .get() as Record<string, unknown> | undefined;
      if (!row) {
        throw new Error("failed to read saved checkpoint");
      }
      return mapRow(row);
    },

    restore(input: RestoreCheckpointInput): CheckpointRecord | null {
      const row = db
        .prepare(
          `SELECT * FROM memory_checkpoints
           WHERE task_id = ? AND expires_at > ?
           ORDER BY saved_at DESC
           LIMIT 1`,
        )
        .get(input.taskId, now()) as Record<string, unknown> | undefined;

      return row ? mapRow(row) : null;
    },

    close(): void {
      db.close();
    },
  };
}
