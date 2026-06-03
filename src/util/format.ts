/**
 * Format token count: 1234 -> '1.2k', 150000 -> '150k'.
 */
export function fmtTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}k`;
  }
  return String(n);
}

/**
 * Generate an ASCII progress bar for context usage.
 */
export function contextBar(
  used: number,
  window: number,
  totalCost: number,
  turnCount: number,
): string {
  if (window === 0) {
    return `$${totalCost.toFixed(4)} · turn ${turnCount}`;
  }

  const pct = (used / window) * 100;

  // Color based on usage
  let color = "\x1B[2m"; // dim
  if (pct >= 90) {
    color = "\x1B[31m"; // red
  } else if (pct >= 70) {
    color = "\x1B[33m"; // yellow
  }

  const reset = "\x1B[0m";

  return (
    `${color}` +
    `${fmtTokens(used)}/${fmtTokens(window)} tokens` +
    ` (${pct.toFixed(0)}%)` +
    ` · $${totalCost.toFixed(4)}` +
    ` · turn ${turnCount}` +
    `${reset}`
  );
}
