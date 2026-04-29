import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

type Opportunity = {
  id: string;
  title: string;
  provider: string | null;
  type: string;
  description: string | null;
  funding_amount: string | null;
  funding_type: string | null;
  deadline: string | null;
  effort_level: string | null;
  reward_level: string | null;
  application_url: string | null;
};

function formatOpportunityType(type: string) {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default async function OpportunitiesPage() {
  const { data: opportunities, error } = await supabase
    .from("opportunities")
    .select(
      "id, title, provider, type, description, funding_amount, funding_type, deadline, effort_level, reward_level, application_url"
    )
    .eq("is_active", true)
    .eq("is_approved", true)
    .order("deadline", { ascending: true });

  if (error) {
    console.error(error);
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <Badge variant="secondary">Opportunities</Badge>

        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Your ranked opportunities
        </h1>

        <p className="mt-3 max-w-2xl text-muted-foreground">
          Browse scholarships, research opportunities, funded conferences,
          fellowships, grants, and competitions ranked by your competitiveness.
        </p>

        {error ? (
          <Card className="mt-8">
            <CardContent className="p-6">
              <p className="text-sm text-destructive">
                Could not load opportunities. Check your Supabase connection and
                table policies.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-8 grid gap-4">
            {(opportunities as Opportunity[] | null)?.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex flex-col justify-between gap-4 p-6 md:flex-row md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {formatOpportunityType(item.type)}
                      </Badge>

                      {item.deadline && (
                        <Badge variant="outline">Deadline: {item.deadline}</Badge>
                      )}

                      {item.effort_level && (
                        <Badge variant="outline">Effort: {item.effort_level}</Badge>
                      )}
                    </div>

                    <h2 className="mt-3 text-xl font-semibold">{item.title}</h2>

                    {item.provider && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Provider: {item.provider}
                      </p>
                    )}

                    {item.description && (
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                        {item.description}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground">
                      {item.funding_amount && <span>{item.funding_amount}</span>}
                      {item.funding_type && <span>• {item.funding_type}</span>}
                      {item.reward_level && <span>• Reward: {item.reward_level}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="rounded-full border px-4 py-2 text-sm font-semibold">
                      Score soon
                    </div>

                    {item.application_url ? (
                      <Button asChild variant="outline">
                        <a
                          href={item.application_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View details
                        </a>
                      </Button>
                    ) : (
                      <Button variant="outline">View details</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

            {opportunities?.length === 0 && (
              <Card>
                <CardContent className="p-6">
                  <p className="text-muted-foreground">
                    No approved opportunities found yet.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
