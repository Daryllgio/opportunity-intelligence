"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

export function SaveOpportunityButton({
  opportunityId,
}: {
  opportunityId: string;
}) {
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function checkSavedStatus() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("saved_opportunities")
        .select("id")
        .eq("user_id", user.id)
        .eq("opportunity_id", opportunityId)
        .maybeSingle();

      setSaved(Boolean(data));
      setLoading(false);
    }

    checkSavedStatus();
  }, [opportunityId]);

  async function handleClick() {
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    if (saved) {
      const { error } = await supabase
        .from("saved_opportunities")
        .delete()
        .eq("user_id", user.id)
        .eq("opportunity_id", opportunityId);

      if (!error) {
        setSaved(false);
      }

      setSaving(false);
      return;
    }

    const { error } = await supabase.from("saved_opportunities").insert({
      user_id: user.id,
      opportunity_id: opportunityId,
    });

    if (!error) {
      setSaved(true);
    }

    setSaving(false);
  }

  return (
    <Button
      type="button"
      variant={saved ? "default" : "outline"}
      onClick={handleClick}
      disabled={loading || saving}
    >
      {saving ? "Saving..." : saved ? "Saved" : "Save"}
    </Button>
  );
}
