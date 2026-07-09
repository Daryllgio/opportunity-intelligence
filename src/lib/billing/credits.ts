/**
 * Overflow credits — pay-per-use beyond the monthly plan quotas.
 *
 * The full metering exists now (balances, ledger, atomic consumption);
 * Stripe checkout attaches later. Until then, hitting a limit surfaces the
 * purchase path and purchases return a "checkout coming soon" notice.
 *
 * Concurrency: consumption uses compare-and-swap (update ... eq balance)
 * with retries, so two simultaneous requests can never spend one credit
 * twice.
 */

type SupabaseClientLike = {
  from: (table: string) => any;
};

export type CreditType = "competitiveness_report" | "ai_search_credit";

export const CREDIT_PRICES: Record<CreditType, { unit: string; priceUsd: number; pack: number }> = {
  // Priced ~3x marginal AI cost with round numbers; pack sizes keep
  // transactions above card-fee noise.
  competitiveness_report: { unit: "report", priceUsd: 1, pack: 5 },
  ai_search_credit: { unit: "search", priceUsd: 0.5, pack: 10 },
};

export async function getCreditBalance(
  supabase: SupabaseClientLike,
  userId: string,
  creditType: CreditType
): Promise<number> {
  const { data, error } = await supabase
    .from("user_credit_balances")
    .select("balance")
    .eq("user_id", userId)
    .eq("credit_type", creditType)
    .maybeSingle();
  if (error) return 0; // table not migrated yet → no credits
  return Number(data?.balance || 0);
}

/**
 * Spend one credit atomically. Returns false when there is no balance (or
 * the migration hasn't landed).
 */
export async function consumeCredit(
  supabase: SupabaseClientLike,
  userId: string,
  creditType: CreditType,
  referenceId: string | null = null
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error } = await supabase
      .from("user_credit_balances")
      .select("id, balance")
      .eq("user_id", userId)
      .eq("credit_type", creditType)
      .maybeSingle();

    if (error || !row || Number(row.balance) < 1) return false;

    // Compare-and-swap on the balance we read.
    const { data: updated } = await supabase
      .from("user_credit_balances")
      .update({
        balance: Number(row.balance) - 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("balance", row.balance)
      .select("id");

    if (updated && updated.length > 0) {
      await supabase.from("credit_ledger").insert({
        user_id: userId,
        credit_type: creditType,
        delta: -1,
        reason: "overflow_use",
        reference_id: referenceId,
      });
      return true;
    }
    // Lost the race; re-read and retry.
  }
  return false;
}

/** Add credits (future Stripe webhook / admin grant). */
export async function grantCredits(
  supabase: SupabaseClientLike,
  userId: string,
  creditType: CreditType,
  amount: number,
  reason: "purchase" | "refund" | "admin_grant",
  referenceId: string | null = null
): Promise<boolean> {
  if (!Number.isInteger(amount) || amount <= 0) return false;

  const { data: row, error } = await supabase
    .from("user_credit_balances")
    .select("id, balance")
    .eq("user_id", userId)
    .eq("credit_type", creditType)
    .maybeSingle();
  if (error) return false;

  if (row?.id) {
    const { error: updateError } = await supabase
      .from("user_credit_balances")
      .update({
        balance: Number(row.balance) + amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updateError) return false;
  } else {
    const { error: insertError } = await supabase
      .from("user_credit_balances")
      .insert({ user_id: userId, credit_type: creditType, balance: amount });
    if (insertError) return false;
  }

  await supabase.from("credit_ledger").insert({
    user_id: userId,
    credit_type: creditType,
    delta: amount,
    reason,
    reference_id: referenceId,
  });
  return true;
}
