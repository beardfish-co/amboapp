// app/api/stripe/webhook/route.ts
// Receives Stripe webhook events and keeps the subscriptions table in sync.
//
// Events handled:
//   checkout.session.completed      — subscription created via checkout
//   customer.subscription.updated   — plan change, renewal, trial end
//   customer.subscription.deleted   — cancellation
//
// Must be registered in Stripe dashboard:
//   Endpoint URL: https://amboapp.org/api/stripe/webhook
//   Events:       checkout.session.completed
//                 customer.subscription.updated
//                 customer.subscription.deleted

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";

export const runtime = "nodejs";

// Stripe requires the raw body for signature verification.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get("stripe-signature") ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("[webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {

      // ── Checkout completed ──────────────────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const subscriptionId = session.subscription as string;
        const customerId     = session.customer as string;
        const userId         = session.client_reference_id ??
          session.metadata?.supabase_user_id ?? null;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const sub = subscription as unknown as {
          status: string;
          current_period_end: number;
          trial_end: number | null;
          items: { data: Array<{ price: { id: string } }> };
        };

        await admin.from("subscriptions").upsert({
          user_id:                  userId ?? await getUserIdByCustomer(admin, customerId),
          stripe_customer_id:       customerId,
          stripe_subscription_id:   subscriptionId,
          status:                   sub.status,
          price_id:                 sub.items.data[0]?.price.id ?? null,
          current_period_end:       new Date(sub.current_period_end * 1000).toISOString(),
          trial_end:                sub.trial_end
            ? new Date(sub.trial_end * 1000).toISOString()
            : null,
          updated_at:               new Date().toISOString(),
        });
        break;
      }

      // ── Subscription updated (renewal, plan change, trial → active) ─────
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId   = subscription.customer as string;
        const sub = subscription as unknown as {
          id: string;
          status: string;
          current_period_end: number;
          trial_end: number | null;
          items: { data: Array<{ price: { id: string } }> };
        };

        await admin.from("subscriptions").upsert({
          user_id:                  await getUserIdByCustomer(admin, customerId),
          stripe_customer_id:       customerId,
          stripe_subscription_id:   sub.id,
          status:                   sub.status,
          price_id:                 sub.items.data[0]?.price.id ?? null,
          current_period_end:       new Date(sub.current_period_end * 1000).toISOString(),
          trial_end:                sub.trial_end
            ? new Date(sub.trial_end * 1000).toISOString()
            : null,
          updated_at:               new Date().toISOString(),
        });
        break;
      }

      // ── Subscription deleted (cancelled) ────────────────────────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId   = subscription.customer as string;

        await admin.from("subscriptions")
          .update({
            status:     "cancelled",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);
        break;
      }

      default:
        // Unhandled event — acknowledge receipt and move on
        break;
    }
  } catch (err) {
    console.error("[webhook] Handler error:", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ── Helper — look up supabase user_id from stripe_customer_id ──────────────
async function getUserIdByCustomer(
  admin: ReturnType<typeof createAdminClient>,
  customerId: string
): Promise<string | null> {
  const { data } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}
