/**
 * Parse a string as JSON array, or fall back to newline-delimited values.
 * Returns an array of strings.
 */
export function parseJsonOrNewlines(input: string): string[] {
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) {
      return parsed.map(String);
    }
    // Not an array, treat as a single-element array
    return [input];
  } catch {
    // Fall back to newline-delimited
    return input
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
}
