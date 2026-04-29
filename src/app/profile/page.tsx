import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ProfilePage() {
  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <Badge variant="secondary">Profile</Badge>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Build your student profile
        </h1>
        <p className="mt-3 text-muted-foreground">
          Your profile helps OppScore rank opportunities based on your academic
          background, goals, experience, and eligibility.
        </p>

        <Card className="mt-8">
          <CardContent className="p-6">
            <p className="text-muted-foreground">
              Profile form coming next: education level, field of study, GPA,
              country, interests, leadership, research, volunteering, and
              goals.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}