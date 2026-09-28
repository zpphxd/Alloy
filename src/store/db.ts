import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Project, Trigger } from "../domain/types.ts";
import type { Qualification, QualificationCache } from "../qualify/qualifier.ts";

/**
 * Local SQLite store (Node's built-in node:sqlite, so there's no native
 * dependency). Snapshots are kept whole, so any two months can be diffed
 * again later.
 */
export class Store implements QualificationCache {
  readonly db: DatabaseSync;

  constructor(path = process.env.PESCADORA_DB ?? "data/pescadora.sqlite") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        label TEXT NOT NULL,
        taken_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS snapshot_projects (
        snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
        project_id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (snapshot_id, project_id)
      );
      CREATE TABLE IF NOT EXISTS triggers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER REFERENCES snapshots(id),
        kind TEXT NOT NULL,
        project_id TEXT,
        owner_id TEXT,
        detail TEXT NOT NULL,
        data TEXT NOT NULL,
        detected_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS qualifications (
        cache_key TEXT PRIMARY KEY,
        fly_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        verdict TEXT NOT NULL,
        data TEXT NOT NULL
      );
    `);
  }

  saveSnapshot(source: string, label: string, projects: Project[]): number {
    const { lastInsertRowid } = this.db
      .prepare("INSERT INTO snapshots (source, label, taken_at) VALUES (?, ?, ?)")
      .run(source, label, new Date().toISOString());
    const id = Number(lastInsertRowid);
    const ins = this.db.prepare("INSERT OR REPLACE INTO snapshot_projects (snapshot_id, project_id, data) VALUES (?, ?, ?)");
    this.db.exec("BEGIN");
    for (const p of projects) ins.run(id, p.id, JSON.stringify(p));
    this.db.exec("COMMIT");
    return id;
  }

  /** The two most recent snapshots for a source, newest first. */
  latestSnapshots(source: string, n = 2): Array<{ id: number; label: string; projects: Project[] }> {
    const snaps = this.db
      .prepare("SELECT id, label FROM snapshots WHERE source = ? ORDER BY id DESC LIMIT ?")
      .all(source, n) as Array<{ id: number; label: string }>;
    return snaps.map((s) => ({
      ...s,
      projects: (this.db.prepare("SELECT data FROM snapshot_projects WHERE snapshot_id = ?").all(s.id) as Array<{ data: string }>).map(
        (r) => JSON.parse(r.data) as Project,
      ),
    }));
  }

  saveTriggers(snapshotId: number, triggers: Trigger[]): void {
    const ins = this.db.prepare(
      "INSERT INTO triggers (snapshot_id, kind, project_id, owner_id, detail, data, detected_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    for (const t of triggers) ins.run(snapshotId, t.kind, t.projectId ?? null, t.ownerId ?? null, t.detail, JSON.stringify(t), t.detectedAt);
  }

  triggersFor(snapshotId: number): Trigger[] {
    return (this.db.prepare("SELECT data FROM triggers WHERE snapshot_id = ?").all(snapshotId) as Array<{ data: string }>).map(
      (r) => JSON.parse(r.data) as Trigger,
    );
  }

  get(key: string): Qualification | undefined {
    const row = this.db.prepare("SELECT data FROM qualifications WHERE cache_key = ?").get(key) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Qualification) : undefined;
  }

  set(q: Qualification): void {
    this.db
      .prepare("INSERT OR REPLACE INTO qualifications (cache_key, fly_id, owner_id, verdict, data) VALUES (?, ?, ?, ?, ?)")
      .run(q.cacheKey, q.flyId, q.ownerId, q.verdict, JSON.stringify(q));
  }
}
