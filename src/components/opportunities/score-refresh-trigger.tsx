"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

const THROTTLE_KEY = "oppscores:last-score-refresh-attempt";
const THROTTLE_MS = 5 * 60 * 1000;

/**
 * Invisible companion to the browse page: when a signed-in user arrives, run
 * their pending scoring job (if one is ready) and notify the page so a
 * profile edit shows up as fresh scores while they are actually looking.
 */
export function ScoreRefreshTrigger({
  onScoresRefreshed,
}: {
  onScoresRefreshed: () => void;
}) {
  const firedRef = useRef(false);
  const callbackRef = useRef(onScoresRefreshed);
  callbackRef.current = onScoresRefreshed;

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    const lastAttempt = Number(sessionStorage.getItem(THROTTLE_KEY) || 0);
    if (Date.now() - lastAttempt < THROTTLE_MS) return;

    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      sessionStorage.setItem(THROTTLE_KEY, String(Date.now()));

      try {
        const response = await fetch("/api/scoring-jobs/run-due", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!response.ok || cancelled) return;
        const result = await response.json();
        if (result.processed > 0 && (result.created || result.refreshed)) {
          callbackRef.current();
        }
      } catch {
        // Scores refresh on the nightly cron regardless; stay silent.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
