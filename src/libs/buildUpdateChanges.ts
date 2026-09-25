type ChangeMappers<TSource, TChanges extends object> = {
  [K in keyof TChanges]?: (source: TSource) => TChanges[K] | undefined;
};

export function buildUpdateChanges<TSource, TChanges extends object>(
  source: TSource,
  fields: ChangeMappers<TSource, TChanges>,
): Partial<TChanges> {
  const changes: Partial<TChanges> = {};

  for (const key of Object.keys(fields) as (keyof TChanges)[]) {
    const value = fields[key]?.(source);
    if (value === undefined) continue;

    if (typeof value === 'string') {
      changes[key] = value.trim() as TChanges[typeof key];
    } else {
      changes[key] = value;
    }
  }

  return changes;
}
