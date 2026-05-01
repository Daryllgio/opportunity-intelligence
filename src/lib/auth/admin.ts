import { supabase } from "@/lib/supabase";

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
