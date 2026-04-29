import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <Badge variant="secondary">Admin</Badge>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Opportunity management
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Add, edit, review, and approve opportunities before they appear to
          students.
        </p>

        <Card className="mt-8">
          <CardContent className="p-6">
            <p className="text-muted-foreground">
              Admin tools coming next: add opportunity, review AI extractions,
              manage sources, and approve listings.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}