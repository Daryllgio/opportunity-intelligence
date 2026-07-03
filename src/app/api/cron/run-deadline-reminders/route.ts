import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { runDeadlineReminders } from "@/lib/notifications/deadline-reminders";

function createServiceSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET || authHeader !== expected) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const supabase = createServiceSupabase();
    const summary = await runDeadlineReminders({ supabase });

    return NextResponse.json({ ran: true, ...summary });
  } catch (error) {
    console.error(
      "run-deadline-reminders error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Failed to run deadline reminders." },
      { status: 500 }
    );
  }
}

// Vercel cron sends GET requests.
export async function GET(request: NextRequest) {
  return POST(request);
}
