/**
 * Extracts a readable message from a failed API response body — a plain string `error`,
 * or a zod `.flatten()` shape (`{ formErrors, fieldErrors }`) as returned by the
 * `/api/templates`/`/api/runs` routes on a 400, joined into one line. Falls back to a
 * generic message when the body doesn't match either shape.
 */
export function extractApiErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error: unknown }).error;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object') {
      const flat = error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
      const messages = [
        ...(flat.formErrors ?? []),
        ...Object.entries(flat.fieldErrors ?? {}).flatMap(([field, msgs]) => msgs.map((m) => `${field}: ${m}`)),
      ];
      if (messages.length > 0) return messages.join('; ');
    }
  }
  return fallback;
}
