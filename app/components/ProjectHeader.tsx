'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { extractApiErrorMessage } from '@/lib/apiError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function ProjectHeader({
  id,
  name,
  hostnames,
}: {
  id: string;
  name: string;
  hostnames: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftHostnames, setDraftHostnames] = useState(hostnames.join(', '));
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setDraftName(name);
    setDraftHostnames(hostnames.join(', '));
    setError(null);
    setEditing(false);
  }

  async function save() {
    const list = draftHostnames
      .split(/[\s,]+/)
      .map((h) => h.trim())
      .filter(Boolean);
    if (!draftName.trim() || list.length === 0) {
      setError('A name and at least one hostname are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draftName.trim(), hostnames: list }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(extractApiErrorMessage(body, 'Failed to save.'));
        setSaving(false);
        return;
      }
      setSaving(false);
      setEditing(false);
      router.refresh();
    } catch {
      setError('Failed to save — is the server reachable?');
      setSaving(false);
    }
  }

  async function deleteProject() {
    setBusy(true);
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    router.push('/projects');
  }

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="project-name-edit">Project name</Label>
          <Input id="project-name-edit" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
        </div>
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="project-hostnames-edit">Hostnames</Label>
          <Input
            id="project-hostnames-edit"
            value={draftHostnames}
            onChange={(e) => setDraftHostnames(e.target.value)}
            placeholder="www.example.com, staging.example.com"
          />
          <p className="text-xs text-muted-foreground">Comma- or space-separated. URLs are routed here by hostname.</p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={saving}>
            <X className="size-3.5" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight">{name}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {hostnames.length > 0 ? hostnames.join(' · ') : 'No hostnames yet'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" />
          Edit
        </Button>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button type="button" size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={busy}>
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &quot;{name}&quot;?</AlertDialogTitle>
              <AlertDialogDescription>
                The project and its hostname list are removed. Its templates, runs and content checks are kept but
                become unassigned.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={deleteProject}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
