/** "Added 3 days ago" — students need to know content is fresh. */
export function FreshnessLabel({ createdAt }: { createdAt: string | null }) {
  if (!createdAt) return null;

  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;

  const days = Math.floor((Date.now() - created.getTime()) / 86400000);

  let label: string;
  if (days <= 0) label = "Added today";
  else if (days === 1) label = "Added yesterday";
  else if (days < 7) label = `Added ${days} days ago`;
  else if (days < 30) label = `Added ${Math.floor(days / 7)}w ago`;
  else if (days < 365) label = `Added ${Math.floor(days / 30)}mo ago`;
  else return null;

  return (
    <span className="text-xs text-neutral-400 dark:text-neutral-500">
      {label}
    </span>
  );
}
