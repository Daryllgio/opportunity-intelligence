"use client";

import Link from "next/link";
import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const plans = [
  {
    name: "Free",
    price: "$0",
    cadence: "",
    badge: "Free",
    description:
      "Explore the opportunity database and use basic tools before choosing a paid plan.",
    features: [
      "Opportunity database access",
      "Filters by category, country, deadline, and funding type",
      "Student profile creation",
      "Save up to 10 opportunities",
      "Competitiveness scores not included",
      "Gap reports not included",
    ],
    cta: "Start free",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$20",
    cadence: "/month",
    badge: "Most popular",
    description:
      "For students actively comparing opportunities and deciding where to focus their applications.",
    features: [
      "250 opportunity competitiveness scores",
      "40 opportunity gap reports",
      "Ranked opportunity list based on your profile",
      "Deadline tracking for saved opportunities",
      "Best for active scholarship and research searches",
    ],
    cta: "Upgrade to Pro",
    href: "/signup",
    highlighted: true,
  },
  {
    name: "Premium",
    price: "$35",
    cadence: "/month",
    badge: "Premium",
    description:
      "For students running a broader search across multiple opportunity types and application cycles.",
    features: [
      "400 opportunity competitiveness scores",
      "90 opportunity gap reports",
      "Ranked opportunity list based on your profile",
      "Deadline tracking for saved opportunities",
      "Best for aggressive scholarship, fellowship, and program searches",
    ],
    cta: "Upgrade to Premium",
    href: "/signup",
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary">Pricing</Badge>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              Choose your plan
            </h1>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={plan.highlighted ? "border-primary shadow-sm" : ""}
              >
                <CardContent className="flex h-full flex-col p-6">
                  <Badge
                    className="w-fit"
                    variant={plan.highlighted ? "default" : "outline"}
                  >
                    {plan.badge}
                  </Badge>

                  <h2 className="mt-6 text-2xl font-semibold">{plan.name}</h2>

                  <div className="mt-4 flex items-end gap-1">
                    <span className="text-4xl font-semibold">{plan.price}</span>
                    {plan.cadence && (
                      <span className="pb-1 text-muted-foreground">
                        {plan.cadence}
                      </span>
                    )}
                  </div>

                  <p className="mt-4 min-h-12 text-sm leading-6 text-muted-foreground">
                    {plan.description}
                  </p>

                  <ul className="mt-4 flex-1 space-y-3 text-sm text-muted-foreground">
                    {plan.features.map((feature) => (
                      <li key={feature}>• {feature}</li>
                    ))}
                  </ul>

                  <Button
                    asChild
                    className="mt-8 w-full"
                    variant={plan.highlighted ? "default" : "outline"}
                  >
                    <Link href={plan.href}>{plan.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mt-8">
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold">
                How scores and reports work
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Competitiveness scores help rank opportunities by how well they
                match your profile. Gap reports provide a closer look at the
                strengths and risks in your profile for a specific opportunity.
                Once generated, scores and reports are saved so you can return
                to them later.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
