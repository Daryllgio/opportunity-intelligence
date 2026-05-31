import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export type RequireAdminResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string };

/**
 * Authorizes an API request as an admin.
 *
 * Reads the bearer token from the Authorization header, validates it against
 * Supabase auth, and confirms the user's profile has is_admin = true. Uses the
 * anon key (not the service role) so it relies on the same RLS as the rest of
 * the app. This is the shared pattern used by admin API routes.
 */
export async function requireAdminRequest(
  request: NextRequest
): Promise<RequireAdminResult> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { ok: false, status: 401, error: "Authentication required." };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, status: 500, error: "Auth is not configured." };
  }

  const authedClient = createClient(supabaseUrl, supabaseAnonKey);

  const {
    data: { user },
    error: userError,
  } = await authedClient.auth.getUser(token);

  if (userError || !user) {
    return { ok: false, status: 401, error: "Invalid or expired session." };
  }

  const { data: profile } = await authedClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return { ok: false, status: 403, error: "Admin access required." };
  }

  return { ok: true, userId: user.id };
}

export async function getCurrentUserProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      user: null,
      profile: null,
      isAdmin: false,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    profile,
    isAdmin: Boolean(profile?.is_admin),
  };
}
