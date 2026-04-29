import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const opportunities = [
  {
    name: "Global Research Fellowship",
    type: "Research",
    score: "88/100",
    action: "Apply Now",
  },
  {
    name: "Student Innovation Grant",
    type: "Grant",
    score: "81/100",
    action: "Save for Later",
  },
  {
    name: "Youth Leadership Summit",
    type: "Funded Conference",
    score: "74/100",
    action: "Improve First",
  },
];

export default function OpportunitiesPage() {
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

        <div className="mt-8 grid gap-4">
          {opportunities.map((item) => (
            <Card key={item.name}>
              <CardContent className="flex flex-col justify-between gap-4 p-6 md:flex-row md:items-center">
                <div>
                  <Badge variant="secondary">{item.type}</Badge>
                  <h2 className="mt-3 text-xl font-semibold">{item.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Recommended action: {item.action}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="rounded-full border px-4 py-2 text-sm font-semibold">
                    {item.score}
                  </div>
                  <Button variant="outline">View details</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}