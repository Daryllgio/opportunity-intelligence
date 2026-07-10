/**
 * Constraint-safe application_status writes.
 *
 * The database CHECK constraint predates "not_yet_open" (added in
 * scripts/sql/apply-me-2.sql). Until the founder applies that migration,
 * writes carrying "not_yet_open" downgrade to "closed" and retry once —
 * visibility treats both identically (not accepting = not shown), and the
 * open date lives in attributes.application_opens_at either way.
 */
export async function writeWithStatusFallback<T>(
  attempt: (
    payload: Record<string, unknown>
  ) => Promise<{ data: T; error: { message: string } | null }>,
  payload: Record<string, unknown>
): Promise<{ data: T; error: { message: string } | null }> {
  const first = await attempt(payload);
  if (
    first.error &&
    first.error.message.includes("application_status_check") &&
    payload.application_status === "not_yet_open"
  ) {
    return attempt({ ...payload, application_status: "closed" });
  }
  return first;
}
