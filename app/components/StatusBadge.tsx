import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

const STYLES: Record<string, string> = {
  queued: 'bg-muted text-muted-foreground',
  running: 'bg-status-info/10 text-status-info',
  complete: 'bg-status-good/10 text-status-good',
  error: 'bg-status-critical/10 text-status-critical',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`border-transparent ${STYLES[status] ?? STYLES.queued}`}>
      {status === 'running' && <Loader2 className="size-3 animate-spin" />}
      {status}
    </Badge>
  );
}
