import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { ProfileForm } from "@/components/profile/profile-form";

export default function EditProfilePage() {
  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-4xl">
          <Badge variant="secondary">Profile Builder</Badge>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Edit your opportunity profile
          </h1>

          <p className="mt-3 text-muted-foreground">
            Add the academic background and experience details OppScore uses to
            evaluate your competitiveness.
          </p>

          <ProfileForm />
        </div>
      </section>
    </main>
  );
}
