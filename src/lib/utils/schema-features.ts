/**
 * Live-schema feature probes.
 *
 * Migrations are applied by hand in the Supabase SQL editor, so deployed code
 * can be ahead of the database. Writers that touch new columns probe once per
 * process and quietly omit the column until the migration lands — a pending
 * migration must never break the pipeline.
 */

type SupabaseClientLike = {
  from: (table: string) => any;
};

const probeCache = new Map<string, Promise<boolean>>();

export function tableHasColumn(
  supabase: SupabaseClientLike,
  table: string,
  column: string
): Promise<boolean> {
  const key = `${table}.${column}`;
  const cached = probeCache.get(key);
  if (cached) return cached;

  const probe = (async () => {
    try {
      const { error } = await supabase.from(table).select(column).limit(1);
      return !error;
    } catch {
      return false;
    }
  })();

  probeCache.set(key, probe);
  return probe;
}

/** Test helper. */
export function resetSchemaFeatureCache() {
  probeCache.clear();
}
