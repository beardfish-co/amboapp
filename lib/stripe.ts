// lib/stripe.ts — server-side Stripe client singleton.
// Never import this in client components.

import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
  typescript: true,
});

export const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY!;
export const PRICE_ANNUAL  = process.env.STRIPE_PRICE_ANNUAL!;

// Trial length in days (4 weeks)
export const TRIAL_DAYS = 28;
