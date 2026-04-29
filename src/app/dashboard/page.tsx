import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <Badge variant="secondary">Dashboard</Badge>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              Your opportunity strategy board
            </h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              See the opportunities you qualify for, ranked by how competitive
              you are for each one.
            </p>
          </div>

          <Button>Complete profile</Button>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Top score</p>
              <h2 className="mt-2 text-3xl font-semibold">88/100</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Strongest opportunity match
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Saved</p>
              <h2 className="mt-2 text-3xl font-semibold">0</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Opportunities saved for later
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Plan</p>
              <h2 className="mt-2 text-3xl font-semibold">Free</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Upgrade to unlock full scores
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}