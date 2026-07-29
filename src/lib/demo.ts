/**
 * Demo-instance behaviour.
 *
 * A public demo has two problems a private deployment does not: visitors need
 * to be told how to get in, and whatever they do is the next visitor's starting
 * point. `DEMO_MODE` turns on the sign-in hint; the reset cron deals with the
 * second.
 *
 * Everything here is off unless `NEXT_PUBLIC_DEMO_MODE` is exactly "true", so
 * a normal deployment behaves as if this file does not exist. It is
 * NEXT_PUBLIC_ because the login page needs it, which also means the demo
 * credentials below are public — that is the point, but it is also the reason
 * a demo instance must hold nothing you care about.
 */

export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** Shown on the login screen so a visitor can get in without signing up. */
export const DEMO_CREDENTIALS = {
  email: process.env.NEXT_PUBLIC_DEMO_EMAIL || "ada@example.com",
  password: process.env.NEXT_PUBLIC_DEMO_PASSWORD || "taskflow-demo",
};
