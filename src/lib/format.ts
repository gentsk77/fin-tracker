/**
 * Currency / money formatting helpers.
 */

export function formatCurrency(
  amount: number | null | undefined,
  currency = "USD"
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return "–";
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Like {@link formatCurrency} but drops the cents: "$1,234,567". Use for
 * six-figure balances and suggested-trade amounts where cents are just noise.
 */
export function formatCurrencyWhole(
  amount: number | null | undefined,
  currency = "USD"
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return "–";
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}

/**
 * Compact currency for at-a-glance stats: "$12.3K", "$1.2M", "$450K". Falls back
 * to a whole-dollar amount under $1,000.
 */
export function formatCompactCurrency(
  amount: number | null | undefined,
  currency = "USD"
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return "–";
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return formatCurrencyWhole(amount, currency);
  }
}

/**
 * Like {@link formatCurrency} but always shows an explicit sign: "+$49.17"
 * for gains, "-$49.17" for losses, "$0.00" for exactly zero. Used for
 * day-change / movement figures where the direction matters.
 */
export function formatSignedCurrency(
  amount: number | null | undefined,
  currency = "USD"
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return "–";
  }
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${sign}${formatCurrency(Math.abs(amount), currency)}`;
}

export function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return "never";
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString();
}
