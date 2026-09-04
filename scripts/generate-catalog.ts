/**
 * Generates lib/catalog/event-catalog.json from a local checkout of
 * @starberry/advanced-analytics-nextjs.
 *
 * Usage: npx tsx scripts/generate-catalog.ts [--pkg <path-to-repo>] [--out <path>]
 *
 * Two sources are merged:
 *   1. EVENT_NAMES in src/events.ts — the closed set of fixed event names.
 *   2. Every payload the package's own vitest suite pushes to window.dataLayer, harvested
 *      by scripts/harvest-catalog.mjs injected as a setup file.
 *
 * The package's vitest.config.ts declares no setupFiles, so injecting one on the CLI needs
 * no change to the sibling repo.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flattenToPaths } from '../lib/diff/flatten';
import { UNDEFINED_MARKER } from '../lib/capture/undefinedMarker';
import type { LeafType } from '../lib/types';
import type { CatalogEvent, CatalogFieldSpec, EventCatalog } from '../lib/catalog/types';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const BEACON_ROOT = resolve(SCRIPT_DIR, '..');

/** Enough distinct values to spot an enum, few enough that a fixture-heavy field stays readable. */
const MAX_SAMPLE_VALUES = 12;

/** Placeholder in scripts/harvest-catalog.mjs, swapped for the real UNDEFINED_MARKER on staging. */
const MARKER_PLACEHOLDER = "'__BEACON_UNDEFINED_MARKER__'";

/**
 * Test files that exercise the transport and config layers rather than an event builder.
 * They push deliberately synthetic names ("test_event") to prove `trackToDataLayer` and
 * `transformEvent` work at all, so those names are fixtures, not events any site should
 * emit. An event sampled *only* from these files is dropped; one that also appears in a
 * real builder test is kept.
 */
const SYNTHETIC_SOURCE_FILES = ['test/push.test.ts', 'test/config.test.ts'];

interface HarvestRecord {
  event: string;
  payload: unknown;
  testName: string;
  testFile: string;
}

function parseArgs(argv: string[]): { pkg: string; out: string } {
  let pkg = resolve(BEACON_ROOT, '..', 'advanced-analytics-nextjs');
  let out = join(BEACON_ROOT, 'lib', 'catalog', 'event-catalog.json');
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--pkg' && argv[i + 1]) pkg = resolve(argv[(i += 1)]);
    else if (argv[i] === '--out' && argv[i + 1]) out = resolve(argv[(i += 1)]);
  }
  return { pkg, out };
}

/**
 * Pulls the fixed event-name keys out of the EVENT_NAMES object literal. A regex rather
 * than a TS parse: the file is a flat `key: "value"` map by construction, and the count
 * assertion below catches it if that ever stops being true.
 */
function parseEventNames(sourcePath: string): string[] {
  const source = readFileSync(sourcePath, 'utf8');
  const start = source.indexOf('export const EVENT_NAMES');
  if (start === -1) throw new Error(`Could not find EVENT_NAMES in ${sourcePath}`);
  const open = source.indexOf('{', start);
  const close = source.indexOf('} as const', open);
  if (open === -1 || close === -1) throw new Error(`Could not parse the EVENT_NAMES literal in ${sourcePath}`);

  const names = [...source.slice(open, close).matchAll(/^\s*([A-Za-z_][\w]*)\s*:/gm)].map((m) => m[1]);
  if (names.length === 0) throw new Error(`Parsed zero keys out of EVENT_NAMES in ${sourcePath}`);
  return names;
}

/**
 * Throwaway files staged inside the package dir for the duration of the harvest run.
 * Constant names (not randomised) so a crashed run leaves predictable files that the next
 * run clears up front.
 *
 * Both have to live in the package tree rather than tmpdir: the config needs to resolve
 * `vitest/config` and `./vitest.config`, and vite's resolver rejects a Windows absolute
 * path pointing outside its root ("Failed to load url G:/…"), so the setup file has to be
 * reachable as a root-relative id.
 */
const TEMP_CONFIG_NAME = 'vitest.beacon-harvest.config.ts';
const TEMP_SETUP_NAME = 'vitest.beacon-harvest.setup.mjs';

function runHarvest(packageDir: string, harvestDir: string): void {
  const configPath = join(packageDir, TEMP_CONFIG_NAME);
  const setupPath = join(packageDir, TEMP_SETUP_NAME);
  rmSync(configPath, { force: true });
  rmSync(setupPath, { force: true });

  // vitest 2's CLI has no --setupFiles flag, so the hook has to arrive via config.
  const harvestSource = readFileSync(join(BEACON_ROOT, 'scripts', 'harvest-catalog.mjs'), 'utf8');
  if (!harvestSource.includes(MARKER_PLACEHOLDER)) {
    throw new Error(
      `scripts/harvest-catalog.mjs no longer contains ${MARKER_PLACEHOLDER}. It must keep the ` +
        `placeholder so the undefined sentinel is injected from lib/capture/undefinedMarker.ts ` +
        `rather than hand-copied — the real marker is wrapped in NUL bytes that look like spaces.`
    );
  }
  writeFileSync(setupPath, harvestSource.replace(MARKER_PLACEHOLDER, JSON.stringify(UNDEFINED_MARKER)), 'utf8');
  writeFileSync(
    configPath,
    `// Generated by beacon's scripts/generate-catalog.ts. Safe to delete.\n` +
      `import { defineConfig, mergeConfig } from "vitest/config";\n` +
      `import base from "./vitest.config";\n\n` +
      `export default mergeConfig(base, defineConfig({\n` +
      `  test: { setupFiles: ["./${TEMP_SETUP_NAME}"] },\n` +
      `}));\n`,
    'utf8'
  );

  console.log('Running the package test suite with the harvest hook…');
  try {
    const result = spawnSync('npm', ['test', '--', '--config', TEMP_CONFIG_NAME], {
      cwd: packageDir,
      env: { ...process.env, BEACON_HARVEST_DIR: harvestDir },
      encoding: 'utf8',
      shell: true,
    });

    if (result.status !== 0) {
      console.error(result.stdout);
      console.error(result.stderr);
      throw new Error(
        `The package's test suite failed (exit ${result.status}). The catalog is only trustworthy ` +
          `when its source suite is green — fix the package first.`
      );
    }
  } finally {
    rmSync(configPath, { force: true });
    rmSync(setupPath, { force: true });
  }
}

function readHarvest(harvestDir: string): HarvestRecord[] {
  const records: HarvestRecord[] = [];
  for (const file of readdirSync(harvestDir)) {
    if (!file.endsWith('.jsonl')) continue;
    for (const line of readFileSync(join(harvestDir, file), 'utf8').split('\n')) {
      if (line.trim()) records.push(JSON.parse(line) as HarvestRecord);
    }
  }
  return records;
}

/** Accumulator for one dot-path across every sample of one event. */
interface FieldAccumulator {
  types: Set<LeafType>;
  seenIn: number;
  values: Set<string | number | boolean | null>;
  truncated: boolean;
}

/** Event names seen only in the transport/config specs — fixtures, not real events. */
function syntheticEventNames(records: HarvestRecord[]): Set<string> {
  const realSourced = new Set<string>();
  const allNames = new Set<string>();
  for (const record of records) {
    allNames.add(record.event);
    if (!SYNTHETIC_SOURCE_FILES.some((file) => record.testFile.endsWith(file))) realSourced.add(record.event);
  }
  return new Set([...allNames].filter((name) => !realSourced.has(name)));
}

function aggregate(records: HarvestRecord[], fixedNames: Set<string>): CatalogEvent[] {
  const byEvent = new Map<string, { sampleCount: number; fields: Map<string, FieldAccumulator> }>();
  const synthetic = syntheticEventNames(records);

  for (const record of records) {
    if (synthetic.has(record.event)) continue;
    let entry = byEvent.get(record.event);
    if (!entry) {
      entry = { sampleCount: 0, fields: new Map() };
      byEvent.set(record.event, entry);
    }
    entry.sampleCount += 1;

    for (const leaf of flattenToPaths(record.payload)) {
      let field = entry.fields.get(leaf.path);
      if (!field) {
        field = { types: new Set(), seenIn: 0, values: new Set(), truncated: false };
        entry.fields.set(leaf.path, field);
      }
      field.types.add(leaf.type);
      field.seenIn += 1;

      // Only primitives are useful as enum evidence. An 'array' leaf's value is the whole
      // array (flatten treats arrays as opaque), and objects never reach a leaf at all.
      const isPrimitive =
        leaf.type === 'string' || leaf.type === 'number' || leaf.type === 'boolean' || leaf.type === 'null';
      if (isPrimitive) {
        if (field.values.size >= MAX_SAMPLE_VALUES) field.truncated = true;
        else field.values.add(leaf.value as string | number | boolean | null);
      }
    }
  }

  // Sorted at every level so regenerating without upstream changes produces a byte-identical
  // file, which is what makes the committed catalog a reviewable diff.
  return [...byEvent.entries()]
    .map(([eventName, entry]): CatalogEvent => ({
      eventName,
      sampleCount: entry.sampleCount,
      fixedName: fixedNames.has(eventName),
      fields: [...entry.fields.entries()]
        .map(([path, field]): CatalogFieldSpec => {
          const spec: CatalogFieldSpec = {
            path,
            types: [...field.types].sort(),
            seenIn: field.seenIn,
          };
          if (field.values.size > 0) spec.sampleValues = [...field.values].sort(compareValues);
          if (field.truncated) spec.sampleValuesTruncated = true;
          return spec;
        })
        .sort((a, b) => byCodeUnit(a.path, b.path)),
    }))
    .sort((a, b) => byCodeUnit(a.eventName, b.eventName));
}

/**
 * Plain UTF-16 code-unit ordering, deliberately not localeCompare: this file is committed
 * and regenerated on whatever machine happens to run the script, and collation differs
 * with the host's ICU locale (it orders `form_name` before `formId`, code units the other
 * way). Locale-dependent ordering would show up as a spurious diff.
 */
function byCodeUnit(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Total order across the mixed primitive types a single path can hold. */
function compareValues(a: string | number | boolean | null, b: string | number | boolean | null): number {
  const key = (v: typeof a) => `${typeof v}:${String(v)}`;
  return byCodeUnit(key(a), key(b));
}

function main(): void {
  const { pkg, out } = parseArgs(process.argv.slice(2));
  const packageDir = join(pkg, 'packages', 'advanced-analytics-nextjs');

  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
  };
  console.log(`Source: ${manifest.name}@${manifest.version} at ${packageDir}`);

  const eventNames = parseEventNames(join(packageDir, 'src', 'events.ts'));
  console.log(`Parsed ${eventNames.length} fixed event names from EVENT_NAMES.`);

  const harvestDir = mkdtempSync(join(tmpdir(), 'beacon-harvest-'));
  let records: HarvestRecord[];
  try {
    runHarvest(packageDir, harvestDir);
    records = readHarvest(harvestDir);
  } finally {
    rmSync(harvestDir, { recursive: true, force: true });
  }
  console.log(`Harvested ${records.length} pushes.`);

  const events = aggregate(records, new Set(eventNames));
  const sampled = new Set(events.map((e) => e.eventName));

  // No generation timestamp on purpose: regenerating an unchanged package must produce a
  // byte-identical file, so a diff in this catalog always means the upstream spec moved.
  const catalog: EventCatalog = {
    version: 1,
    packageName: manifest.name,
    packageVersion: manifest.version,
    events,
    unsampledEventNames: eventNames.filter((name) => !sampled.has(name)).sort(),
  };

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

  const dynamic = events.filter((e) => !e.fixedName).length;
  console.log(`\nWrote ${out}`);
  console.log(`  ${events.length} events with samples (${dynamic} dynamic, not in EVENT_NAMES)`);
  console.log(`  ${catalog.unsampledEventNames.length} EVENT_NAMES keys with no sample`);
}

main();
