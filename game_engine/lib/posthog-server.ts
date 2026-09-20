import { PostHog } from "posthog-node";

export function getPostHogClient(): PostHog {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!token) {
    if (process.env.NODE_ENV !== "production") {
      // warn, not error: matches PostHogInit.tsx. A missing analytics token
      // drops events, it does not break a request.
      console.warn(
        "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is not set, so analytics events are dropped. " +
          "Harmless locally; set it in game_engine/.env to enable PostHog."
      );
    }
  }

  return new PostHog(token ?? "", {
    host: host ?? "https://eu.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });
}
