/** "3,520" style grouping, matching the `number` pipe used elsewhere in the app. */
export function groupDigits(amount: number): string {
  return Math.round(amount).toLocaleString('en-US');
}

/** Full amount, e.g. "KSh 389,000". */
export function formatKsh(amount: number): string {
  return `KSh ${groupDigits(amount)}`;
}

function trimOneDecimal(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}

/** Short amount for tight spaces (chart centres, stat cards): 950, 3.5k,
 * 389k, 1.2M. Callers that need the exact figure should show it elsewhere
 * (a legend, a tooltip or an aria-label). */
export function compactAmount(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    return `${trimOneDecimal(amount / 1_000_000)}M`;
  }
  if (abs >= 10_000) {
    return `${Math.round(amount / 1_000)}k`;
  }
  if (abs >= 1_000) {
    return `${trimOneDecimal(amount / 1_000)}k`;
  }
  return Math.round(amount).toString();
}

/** Short amount with currency, e.g. "KSh 389k". */
export function formatKshCompact(amount: number): string {
  return `KSh ${compactAmount(amount)}`;
}
