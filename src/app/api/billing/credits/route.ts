import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  CREDIT_PRICES,
  getCreditBalance,
  type CreditType,
} from "@/lib/billing/credits";

function createSupabaseForRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function isCreditType(value: unknown): value is CreditType {
  return value === "competitiveness_report" || value === "ai_search_credit";
}

/** GET: balances + pack pricing (drives the top-up UI). */
export async function GET(request: NextRequest) {
  const supabase = createSupabaseForRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
  }

  const service = createServiceSupabase();
  const balances: Record<string, number> = {};
  for (const type of Object.keys(CREDIT_PRICES) as CreditType[]) {
    balances[type] = await getCreditBalance(service, user.id, type);
  }

  return NextResponse.json({ balances, pricing: CREDIT_PRICES });
}

/**
 * POST: purchase intent. The metering and balances are fully live; the
 * actual charge connects when Stripe is added — until then this returns the
 * pack the user asked for and an honest "checkout coming soon".
 */
export async function POST(request: NextRequest) {
  const supabase = createSupabaseForRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
  }

  const body = await request.json();
  if (!isCreditType(body.creditType)) {
    return NextResponse.json({ error: "Unknown credit type." }, { status: 400 });
  }

  const price = CREDIT_PRICES[body.creditType as CreditType];
  return NextResponse.json(
    {
      checkoutAvailable: false,
      message: `Top-ups (${price.pack} ${price.unit}s for $${(
        price.pack * price.priceUsd
      ).toFixed(2)}) are almost ready — checkout is coming soon.`,
    },
    { status: 501 }
  );
}
