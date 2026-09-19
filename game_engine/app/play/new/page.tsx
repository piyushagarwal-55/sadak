import { Suspense } from "react";
import type { Metadata } from "next";
import NewScenario from "@/components/play/NewScenario";

export const metadata: Metadata = {
  title: "Describe a situation — SADAK",
  description: "Say what you want to practise and walk into it.",
};

/**
 * `NewScenario` reads `?city=` with `useSearchParams`, which opts the route out
 * of prerendering unless it sits behind a Suspense boundary. The fallback is
 * the page's own frame rather than a spinner, so arriving from the city picker
 * does not flash an empty screen on the way in.
 */
export default function NewScenarioPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] bg-background px-4 py-10">
          <div className="mx-auto max-w-2xl">
            <h1 className="font-heading text-3xl font-bold">What do you want to practise?</h1>
          </div>
        </div>
      }
    >
      <NewScenario />
    </Suspense>
  );
}
