import { Badge } from "@/components/ui/badge";
import { ProfileForm } from "@/components/profile/profile-form";

export default function ProfilePage() {
  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <Badge variant="secondary">Profile</Badge>

        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Build your opportunity profile
        </h1>

        <p className="mt-3 text-muted-foreground">
          Complete your profile so OppScore can rank opportunities based on your
          background and experience.
        </p>

        <ProfileForm />
      </div>
    </main>
  );
}
