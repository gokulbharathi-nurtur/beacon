import type { LeafType } from '@/lib/types';

export interface FieldLeaf {
  path: string;
  value: unknown;
  type: LeafType;
}

/**
 * Recursively walks an object into dot-path leaves. Arrays are a single leaf at their
 * own path (not recursed into — V1 doesn't diff per-element array contents). `undefined`
 * values are dropped entirely so a field explicitly set to `undefined` (e.g. the real
 * `sidebar_open: undefined` pattern) and a field that's simply missing both read as
 * "field absent" to callers. `null` is its own LeafType since `typeof null === 'object'`.
 */
export function flattenToPaths(obj: unknown, prefix = ''): FieldLeaf[] {
  if (obj === undefined) {
    return [];
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
