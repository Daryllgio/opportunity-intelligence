import { redirect } from "next/navigation";

/**
 * The dashboard is gone: everything it showed (top matches, saved items,
 * deadlines, report counts) lives where users actually act on it — the
 * Opportunities page (sorted by match, with deadline/newest sorts) and the
 * Saved page (saved list + gap reports). This route survives only so old
 * links and post-login redirects keep working.
 */
export default function DashboardRedirect() {
  redirect("/opportunities");
}
