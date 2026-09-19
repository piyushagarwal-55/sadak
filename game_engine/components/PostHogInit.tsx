"use client";

import posthog from "posthog-js";

if (typeof window !== "undefined") {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV !== "production") {
      // warn, not error: a console.error from a client component trips the Next
      // dev error overlay, and a missing analytics token is not a broken app.
      console.warn(
        "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is not set, so analytics events are dropped. " +
          "Harmless locally; set it in game_engine/.env to enable PostHog."
      );
    }
  } else {
    posthog.init(token, {
      api_host: "/ingest",
      ui_host: "https://eu.posthog.com",
      defaults: "2026-01-30",
      capture_exceptions: true,
      debug: process.env.NODE_ENV === "development",
    });
  }
}

export default function PostHogInit() {
  return null;
}
