export function buildUpdateParts(
  fields: readonly [column: string, value: unknown][],
  initialValues: readonly unknown[] = [],
) {
  const assignments: string[] = [];
  const values = [...initialValues];

  for (const [column, value] of fields) {
    if (value === undefined) continue;

    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  }

  return { assignments, values };
}
