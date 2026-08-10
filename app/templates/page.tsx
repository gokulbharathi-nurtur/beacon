import { desc } from 'drizzle-orm';
import Link from 'next/link';
import { Plus, ArrowUpRight, FileStack } from 'lucide-react';
import { db } from '@/lib/db/client';
import { templates } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { relativeTime } from '@/lib/relativeTime';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const allTemplates = await db.select().from(templates).orderBy(desc(templates.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">Saved reference captures used to diff future runs against.</p>
        </div>
        <Button render={<Link href="/templates/new" />} nativeButton={false}>
          <Plus className="size-4" />
          Record new template
        </Button>
      </div>

      {allTemplates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <FileStack className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No templates saved yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {allTemplates.map((t) => (
              <li key={t.id}>
                <Link href={`/templates/${t.id}`} className="group flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-muted/60">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{t.name}</span>
                      <span className="text-xs text-muted-foreground">{t.events.length} events</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.sourceUrl}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">updated {relativeTime(t.updatedAt)}</span>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
