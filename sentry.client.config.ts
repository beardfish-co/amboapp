import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://5a2d0e372ea04ac31dac7327105e3321@o4511292415803392.ingest.de.sentry.io/4511292418293840",

  // Capture 10% of sessions for performance tracing in production
  tracesSampleRate: 0.1,

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  // Don't report errors from browser extensions
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
  ],
});
