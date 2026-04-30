import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function SavedPage() {
  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <Badge variant="secondary">Saved</Badge>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Saved opportunities
          </h1>

          <p className="mt-3 max-w-2xl text-muted-foreground">
            Opportunities you save will appear here.
          </p>

          <Card className="mt-8">
            <CardContent className="p-6">
              <p className="text-muted-foreground">
                Save functionality will be connected next.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
