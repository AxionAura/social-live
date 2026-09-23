import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { MIGRATIONS } from './migrations.js';

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return randomUUID();
}

export type Row = Record<string, unknown>;

export class Database {
  readonly handle: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.handle = new DatabaseSync(dbPath);
    this.handle.exec('PRAGMA journal_mode = WAL;');
    this.handle.exec('PRAGMA foreign_keys = ON;');
    this.handle.exec('PRAGMA busy_timeout = 5000;');
    this.handle.exec('PRAGMA synchronous = NORMAL;');
    this.migrate();
  }

  private migrate(): void {
    this.handle.exec(
      'CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
    );
    const row = this.handle.prepare('SELECT MAX(version) AS v FROM schema_version').get() as
      | { v: number | null }
      | undefined;
    const current = row?.v ?? 0;
    const pending = MIGRATIONS.filter((migration) => migration.version > current);
    if (pending.length === 0) return;
    // Table-rebuild migrations must run with FK enforcement off
    // (https://sqlite.org/lang_altertable.html) — PRAGMAs are no-ops inside
    // a transaction, so toggle around the whole batch.
    this.handle.exec('PRAGMA foreign_keys = OFF;');
    try {
      for (const migration of pending) {
        this.transaction(() => {
          this.handle.exec(migration.sql);
          this.handle
            .prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
            .run(migration.version, nowIso());
        });
      }
      const violations = this.handle.prepare('PRAGMA foreign_key_check').all();
      if (violations.length > 0) {
        throw new Error(`foreign key violations after migration: ${JSON.stringify(violations)}`);
      }
    } finally {
      this.handle.exec('PRAGMA foreign_keys = ON;');
    }
  }

  transaction<T>(fn: () => T): T {
    this.handle.exec('BEGIN');
    try {
      const result = fn();
      this.handle.exec('COMMIT');
      return result;
    } catch (error) {
      this.handle.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.handle.close();
  }
}
