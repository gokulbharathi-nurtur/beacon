import type BetterSqlite3 from 'better-sqlite3';
import { hostnameOf } from '@/lib/projects/hostname';

/**
 * One-time data migration for the projects feature (schema migration 0009 only adds the
 * columns). Groups pre-existing templates / runs / content checks by the hostname of their
 * URL into an auto-created project per hostname, so nothing is left unassigned when the
 * dashboard switches to being project-scoped.
 *
 * Idempotent and cheap to re-check: the moment any `projects` row exists we assume the
 * backfill has run and return immediately. Runs in a single transaction so a crash
 * mid-backfill leaves the DB untouched rather than half-assigned.
 */
export function backfillProjects(sqlite: BetterSqlite3.Database): void {
  const existing = sqlite.prepare('SELECT COUNT(*) AS n FROM projects').get() as { n: number };
  if (existing.n > 0) return;

  const hasLegacyData = (
    sqlite.prepare('SELECT COUNT(*) AS n FROM templates').get() as { n: number }
  ).n;
  const hasLegacyChecks = (
    sqlite.prepare('SELECT COUNT(*) AS n FROM content_checks').get() as { n: number }
  ).n;
  if (hasLegacyData === 0 && hasLegacyChecks === 0) return;

  // Drizzle's `mode: 'timestamp'` columns store Unix *seconds*, not milliseconds.
  const now = Math.floor(Date.now() / 1000);
  const insertProject = sqlite.prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)');
  const insertHostname = sqlite.prepare(
    'INSERT INTO project_hostnames (id, project_id, hostname, created_at) VALUES (?, ?, ?, ?)'
  );
  const findHostname = sqlite.prepare('SELECT project_id AS projectId FROM project_hostnames WHERE hostname = ?');

  // hostname -> projectId, built up as we go so a second URL on the same host reuses the project.
  const projectByHostname = new Map<string, string>();

  function projectForHostname(hostname: string): string {
    const cached = projectByHostname.get(hostname);
    if (cached) return cached;
    const row = findHostname.get(hostname) as { projectId: string } | undefined;
    if (row) {
      projectByHostname.set(hostname, row.projectId);
      return row.projectId;
    }
    const projectId = crypto.randomUUID();
    insertProject.run(projectId, hostname, now, now);
    insertHostname.run(crypto.randomUUID(), projectId, hostname, now);
    projectByHostname.set(hostname, projectId);
    return projectId;
  }

  // `next build` spins up several worker processes that each import the db client and run
  // this. They race on the `projects` count check above; the loser's transaction hits the
  // `project_hostnames.hostname` UNIQUE constraint. That just means a sibling already did
  // the backfill — swallow it rather than failing the build.
  const run = sqlite.transaction(() => {
    // Templates — the primary source of truth for "which sites do we work on".
    const templates = sqlite.prepare('SELECT id, source_url AS sourceUrl FROM templates').all() as {
      id: string;
      sourceUrl: string;
    }[];
    const setTemplateProject = sqlite.prepare('UPDATE templates SET project_id = ? WHERE id = ?');
    for (const t of templates) {
      const host = hostnameOf(t.sourceUrl);
      if (!host) continue;
      setTemplateProject.run(projectForHostname(host), t.id);
    }

    // Runs — inherit the template's project when there is one, else fall back to the
    // target URL's hostname (record-mode runs have no template).
    const runs = sqlite.prepare(
      `SELECT r.id AS id, r.target_url AS targetUrl, t.project_id AS templateProjectId
       FROM runs r LEFT JOIN templates t ON t.id = r.template_id`
    ).all() as { id: string; targetUrl: string; templateProjectId: string | null }[];
    const setRunProject = sqlite.prepare('UPDATE runs SET project_id = ? WHERE id = ?');
    for (const r of runs) {
      let projectId = r.templateProjectId;
      if (!projectId) {
        const host = hostnameOf(r.targetUrl);
        if (host) projectId = projectForHostname(host);
      }
      if (projectId) setRunProject.run(projectId, r.id);
    }

    // Content checks — by the crawl/base URL's hostname.
    const checks = sqlite.prepare('SELECT id, base_url AS baseUrl, content_map_id AS contentMapId FROM content_checks').all() as {
      id: string;
      baseUrl: string;
      contentMapId: string;
    }[];
    const setCheckProject = sqlite.prepare('UPDATE content_checks SET project_id = ? WHERE id = ?');
    const setMapProject = sqlite.prepare('UPDATE content_maps SET project_id = ? WHERE id = ? AND project_id IS NULL');
    for (const c of checks) {
      const host = hostnameOf(c.baseUrl);
      if (!host) continue;
      const projectId = projectForHostname(host);
      setCheckProject.run(projectId, c.id);
      // Give the reference table the same project as the first check that used it.
      setMapProject.run(projectId, c.contentMapId);
    }
  });

  try {
    run();
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint|already exists/i.test(err.message)) return;
    throw err;
  }
}
