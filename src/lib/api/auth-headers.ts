import { supabase } from "@/lib/supabase";

/**
 * Builds JSON request headers including the current user's Supabase bearer
 * token, so admin API routes (which authorize via `requireAdminRequest`) can
 * verify the caller. Falls back to no Authorization header when signed out.
 */
export async function buildAuthedJsonHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  return headers;
}
