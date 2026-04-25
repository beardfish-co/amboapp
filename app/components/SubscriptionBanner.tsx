"use client";

// SubscriptionBanner — shown when trial is expiring or has expired.
//
// States:
//   trial-warning  — < 7 days left in trial
//   trial-expired  — trial over, no active subscription → paywall
//   past-due       — payment failed

// Price IDs are safe to expose client-side (not secret)
const PRICE_MONTHLY = "price_1TQ3kqKAlItjMFkDazoSKIvV";
const PRICE_ANNUAL  = "price_1TQ3kqKAlItjMFkDLmeG7oCV";

interface Subscription {
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
}

interface Props {
  subscription: Subscription;
  onUpgrade: (priceId: string) => void;
  onManage: () => void;
}

export default function SubscriptionBanner({ subscription, onUpgrade, onManage }: Props) {
  const now = Date.now();

  if (subscription.status === "active") return null;

  if (subscription.status === "trialing" && subscription.trial_end) {
    const daysLeft = Math.ceil(
      (new Date(subscription.trial_end).getTime() - now) / (1000 * 60 * 60 * 24)
    );

    if (daysLeft > 7) return null;

    if (daysLeft > 0) {
      return (
        <div style={{ margin: "0 auto", maxWidth: 760, padding: "0 24px" }}>
          <div style={{
            background: "var(--ambo-accent-faint)",
            border: "1px solid var(--ambo-accent-light)",
            borderRadius: "var(--ambo-radius-sm)",
            padding: "12px 16px",
            marginTop: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ambo-text-secondary)", lineHeight: 1.5 }}>
              Your free trial ends in{" "}
              <strong style={{ color: "var(--ambo-accent)" }}>
                {daysLeft} {daysLeft === 1 ? "day" : "days"}
              </strong>.
            </p>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <UpgradeButtons onUpgrade={onUpgrade} />
            </div>
          </div>
        </div>
      );
    }
  }

  // Trial expired or past_due
  const isExpired =
    subscription.status === "past_due" ||
    (subscription.status === "trialing" &&
      subscription.trial_end &&
      new Date(subscription.trial_end).getTime() < now);

  if (isExpired) {
    const isPastDue = subscription.status === "past_due";
    return (
      <div style={{ margin: "0 auto", maxWidth: 760, padding: "0 24px" }}>
        <div style={{
          background: "var(--ambo-surface-solid)",
          border: "1px solid var(--ambo-border-strong)",
          borderLeft: "3px solid var(--ambo-accent)",
          borderRadius: "var(--ambo-radius-sm)",
          padding: "16px 20px",
          marginTop: 20,
        }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ambo-text-muted)",
            marginBottom: 6,
          }}>
            {isPastDue ? "Payment overdue" : "Trial ended"}
          </div>
          <p style={{ margin: "0 0 14px", fontSize: 14, color: "var(--ambo-text-primary)", lineHeight: 1.6 }}>
            {isPastDue
              ? "There was a problem with your last payment. Please update your billing details to keep your access."
              : "Your 4-week free trial has ended. Subscribe to Ambo Pro to continue writing and keep your full homily archive."}
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {isPastDue
              ? <ManageButton onManage={onManage} />
              : <UpgradeButtons onUpgrade={onUpgrade} />
            }
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function UpgradeButtons({ onUpgrade }: { onUpgrade: (priceId: string) => void }) {
  return (
    <>
      <button
        onClick={() => onUpgrade(PRICE_ANNUAL)}
        style={{
          padding: "8px 16px",
          background: "var(--ambo-accent)",
          color: "#fff",
          border: "none",
          borderRadius: "var(--ambo-radius-pill)",
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        $99 / year
      </button>
      <button
        onClick={() => onUpgrade(PRICE_MONTHLY)}
        style={{
          padding: "8px 16px",
          background: "transparent",
          color: "var(--ambo-accent)",
          border: "1px solid var(--ambo-border)",
          borderRadius: "var(--ambo-radius-pill)",
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        $9.99 / month
      </button>
    </>
  );
}

function ManageButton({ onManage }: { onManage: () => void }) {
  return (
    <button
      onClick={onManage}
      style={{
        padding: "8px 16px",
        background: "var(--ambo-accent)",
        color: "#fff",
        border: "none",
        borderRadius: "var(--ambo-radius-pill)",
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      Update billing
    </button>
  );
}
