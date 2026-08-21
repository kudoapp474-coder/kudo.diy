const PRO_STATUSES = new Set(["active", "unpaused"]);
const RESTRICTED_STATUSES = new Set(["cancelled", "expired", "failed", "on_hold", "paused"]);
const MANAGEABLE_STATUSES = new Set(["pending", "active", "unpaused", "on_hold", "paused"]);

export function normalizedSubscriptionStatus(status?: string | null) {
  return status?.toLowerCase() ?? null;
}

export function planForSubscriptionEvent(eventType: string, status?: string | null) {
  if (["subscription.active", "subscription.renewed", "subscription.unpaused"].includes(eventType)) return "pro";
  if (["subscription.cancelled", "subscription.expired", "subscription.failed", "subscription.on_hold", "subscription.paused"].includes(eventType)) return "free";
  if (!["subscription.updated", "subscription.plan_changed", "subscription.update_payment_method"].includes(eventType)) return null;

  const normalized = normalizedSubscriptionStatus(status);
  if (normalized && PRO_STATUSES.has(normalized)) return "pro";
  if (normalized && RESTRICTED_STATUSES.has(normalized)) return "free";
  return null;
}

export function hasProAccess(workspacePlan?: string | null, subscriptionStatus?: string | null) {
  const normalized = normalizedSubscriptionStatus(subscriptionStatus);
  return normalized ? PRO_STATUSES.has(normalized) : workspacePlan === "pro";
}

export function requiresBillingPortal(subscriptionStatus?: string | null) {
  const normalized = normalizedSubscriptionStatus(subscriptionStatus);
  return normalized !== null && MANAGEABLE_STATUSES.has(normalized);
}
