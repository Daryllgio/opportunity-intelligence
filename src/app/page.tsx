import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    title: "Eligible opportunities only",
    description:
      "See scholarships, research programs, funded conferences, fellowships, grants, and competitions that match your profile.",
  },
  {
    title: "Competitiveness score",
    description:
      "Understand how strong your profile is for each opportunity before spending hours applying.",
  },
  {
    title: "Ranked strategy board",
    description:
      "Prioritize the best opportunities first with recommendations like Apply Now, Save for Later, or Improve First.",
  },
];

const opportunityTypes = [
  "Scholarships",
  "Research programs",
  "Funded conferences",
  "Fellowships",
  "Grants",
  "Competitions",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8">
        <nav className="flex items-center justify-between">
          <div className="text-xl font-semibold tracking-tight">OppScore</div>

          <div className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
            <a href="#pricing" className="hover:text-foreground">
              Pricing
            </a>
            <a href="#how-it-works" className="hover:text-foreground">
              How it works
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Button asChild variant="outline">
              <a href="/login">Log in</a>
            </Button>
            <Button asChild>
              <a href="/signup">Get started</a>
            </Button>
          </div>
        </nav>

        <div className="grid flex-1 items-center gap-12 py-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <Badge className="mb-6" variant="secondary">
              Built for students
            </Badge>

            <h1 className="max-w-4xl text-5xl font-semibold tracking-tight md:text-7xl">
              Find global opportunities you are actually competitive for.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              OppScore helps students discover eligible
              scholarships, research opportunities, funded conferences,
              fellowships, grants, and competitions — ranked by how competitive
              they are for each one.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild><a href="/signup">Get started</a></Button>
              <Button size="lg" variant="outline">
                See how it works
              </Button>
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              {opportunityTypes.map((type) => (
                <Badge key={type} variant="outline">
                  {type}
                </Badge>
              ))}
            </div>
          </div>

          <Card className="border-muted shadow-sm">
            <CardContent className="p-6">
              <div className="mb-6">
                <p className="text-sm font-medium text-muted-foreground">
                  Your strategy board
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Top matches this month
                </h2>
              </div>

              <div className="space-y-4">
                {[
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
                ].map((item) => (
                  <div
                    key={item.name}
                    className="rounded-2xl border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Badge variant="secondary">{item.type}</Badge>
                        <h3 className="mt-3 font-medium">{item.name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Recommended action: {item.action}
                        </p>
                      </div>

                      <div className="rounded-full border px-3 py-1 text-sm font-semibold">
                        {item.score}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="features" className="border-t px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <Badge variant="secondary">Core platform</Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              Not another scholarship list.
            </h2>
            <p className="mt-4 text-muted-foreground">
              OppScore turns opportunity discovery into a personalized strategy
              system.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title}>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <Card className="max-w-xl">
            <CardContent className="p-8">
              <Badge variant="secondary">Premium</Badge>
              <h2 className="mt-4 text-4xl font-semibold">$35/month</h2>
              <p className="mt-4 text-muted-foreground">
                Full access to competitiveness scores, ranked opportunities,
                gap reports, saved opportunities, opportunity stacks, and
                deadline alerts.
              </p>
              <Button className="mt-6 w-full" size="lg" asChild>
                <a href="/signup">Start with free access</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}