"use client";

import Link from "next/link";
import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PLAN_LIMITS } from "@/lib/billing/plans";

// Prices come from PLAN_LIMITS (single source of truth); marketing copy lives here.
const plans = [
  {
    name: PLAN_LIMITS.free.name,
    price: `$${PLAN_LIMITS.free.price}`,
    cadence: "",
    badge: "Free",
    description:
      "Explore the opportunity database before choosing a paid plan.",
    features: [
      "Opportunity database access",
      "Basic opportunity browsing",
      "Save up to 10 opportunities",
    ],
    cta: "Start free",
    href: "/signup",
    highlighted: false,
  },
  {
    name: PLAN_LIMITS.pro.name,
    price: `$${PLAN_LIMITS.pro.price}`,
    cadence: "/month",
    badge: "Most popular",
    description:
      "For students actively comparing opportunities and deciding where to focus their applications.",
    features: [
      "Profile-based matching for up to 2 opportunity categories",
      "Standard competitiveness ranking",
      "Deadline tracking",
      "Effort-to-reward insight",
      "40 gap reports per month",
    ],
    cta: "Upgrade to Pro",
    href: "/signup",
    highlighted: true,
  },
  {
    name: PLAN_LIMITS.premium.name,
    price: `$${PLAN_LIMITS.premium.price}`,
    cadence: "/month",
    badge: "Premium",
    description:
      "For students running a broader search across multiple opportunity types and application cycles.",
    features: [
      "Profile-based matching across all opportunity categories",
      "Expanded competitiveness ranking",
      "Faster updates for new and renewed opportunities",
      "Deadline tracking",
      "Effort-to-reward insight",
      "90 gap reports per month",
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
                How ranking and reports work
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                OppScore compares eligible opportunities against your profile and ranks the ones where you appear most competitive. Gap reports provide a deeper breakdown of your strengths, gaps, and positioning for a specific opportunity. Rankings and reports are saved so you can return to them later while the opportunity remains active.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
