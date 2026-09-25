export function buildChangePayload<
  TChanges extends object,
  TRow extends object,
>(
  changes: TChanges,
  previous: TRow,
  current: TRow,
  fields: Partial<Record<keyof TChanges, readonly [keyof TRow, keyof TRow]>>,
) {
  const payload: Partial<
    Record<keyof TChanges, { from: unknown; to: unknown }>
  > = {};

  for (const key of Object.keys(fields) as (keyof TChanges)[]) {
    if (changes[key] === undefined) continue;

    const mapping = fields[key];
    if (!mapping) continue;

    const [previousKey, currentKey] = mapping;
    payload[key] = {
      from: previous[previousKey],
      to: current[currentKey],
    };
  }

  return payload;
}
