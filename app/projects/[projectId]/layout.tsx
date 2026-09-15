import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db/client';
import { projectHostnames, projects } from '@/lib/db/schema';
import { ProjectHeader } from '@/app/components/ProjectHeader';
import { ProjectSubNav } from '@/app/components/ProjectSubNav';

export const dynamic = 'force-dynamic';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    notFound();
  }
  const hostnames = await db
    .select({ hostname: projectHostnames.hostname })
    .from(projectHostnames)
    .where(eq(projectHostnames.projectId, projectId));

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <ProjectHeader id={project.id} name={project.name} hostnames={hostnames.map((h) => h.hostname)} />
        <ProjectSubNav projectId={project.id} />
      </div>
      {children}
    </div>
  );
}
