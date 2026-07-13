import { NextResponse } from "next/server";

/**
 * DEPRECATED (2026-07-12): trials now run through Stripe embedded checkout
 * with a card on file — day 8 charges automatically, no separate cardless
 * trial path exists. This endpoint refuses and points at checkout so no
 * cardless trials can ever be created again. (The trial state machinery in
 * billing/subscription.ts still governs access; Stripe is now its driver.)
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Trials now start through checkout — pick a plan on the pricing page.",
      checkout: true,
    },
    { status: 410 }
  );
}
