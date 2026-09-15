import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { projectHostnames, projects } from '@/lib/db/schema';
import { hostnameOf } from './hostname';

/**
 * The auto-suggest lookup: given any URL, find the project whose hostname list contains
 * that URL's hostname. `project_hostnames.hostname` is unique, so this is an exact,
 * unambiguous match — no scoring, no eTLD+1 guessing. Returns null when the URL is
 * unparseable or its hostname belongs to no project yet.
 */
export async function matchProjectByUrl(url: string): Promise<{ id: string; name: string } | null> {
  const host = hostnameOf(url);
  if (!host) return null;
  const [row] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projectHostnames)
    .innerJoin(projects, eq(projects.id, projectHostnames.projectId))
    .where(eq(projectHostnames.hostname, host))
    .limit(1);
  return row ?? null;
}
