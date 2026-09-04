import type { LeafType } from '@/lib/types';
import { UNDEFINED_MARKER } from '@/lib/capture/undefinedMarker';

export interface FieldLeaf {
  path: string;
  value: unknown;
  type: LeafType;
}

/**
 * Recursively walks an object into dot-path leaves. Arrays are a single leaf at their
 * own path (not recursed into — V1 doesn't diff per-element array contents). A field
 * explicitly set to `undefined` (e.g. the real `sidebar_open: undefined` pattern) — or
 * its JSON-safe stand-in, UNDEFINED_MARKER, once this has round-tripped through DB/API
 * JSON — becomes its own `'undefined'`-typed leaf rather than being silently dropped, so
 * it's still distinguishable from a key that's simply absent (which still yields no leaf,
 * an empty prefix meaning "nothing to flatten at all"). `null` is its own LeafType since
 * `typeof null === 'object'`.
 */
export function flattenToPaths(obj: unknown, prefix = ''): FieldLeaf[] {
  if (obj === undefined || obj === UNDEFINED_MARKER) {
    return prefix ? [{ path: prefix, value: undefined, type: 'undefined' }] : [];
  }
  if (obj === null) {
    return [{ path: prefix, value: null, type: 'null' }];
  }
  if (Array.isArray(obj)) {
    return [{ path: prefix, value: obj, type: 'array' }];
  }
  if (typeof obj === 'object') {
    const leaves: FieldLeaf[] = [];
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      leaves.push(...flattenToPaths(value, path));
    }
    return leaves;
  }
  return [{ path: prefix, value: obj, type: typeof obj as LeafType }];
}

export function leavesToMap(leaves: FieldLeaf[]): Map<string, FieldLeaf> {
  return new Map(leaves.map((leaf) => [leaf.path, leaf]));
}
