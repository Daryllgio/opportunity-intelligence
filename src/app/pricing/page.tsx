import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <Badge variant="secondary">Pricing</Badge>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Simple pricing for serious students
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Start free, then upgrade when you are ready to unlock your full
          opportunity strategy board.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="p-6">
              <Badge variant="outline">Free</Badge>
              <h2 className="mt-4 text-3xl font-semibold">$0</h2>
              <p className="mt-3 text-muted-foreground">
                Limited opportunity matches and basic access.
              </p>
              <Button className="mt-6 w-full" variant="outline">
                Start free
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <Badge>Premium</Badge>
              <h2 className="mt-4 text-3xl font-semibold">$12.99/month</h2>
              <p className="mt-3 text-muted-foreground">
                Unlock competitiveness scores, ranked opportunities, gap
                reports, opportunity stacks, saved opportunities, and deadline
                alerts.
              </p>
              <Button className="mt-6 w-full">Upgrade to Premium</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}