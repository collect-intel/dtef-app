/**
 * Decode URL-encoded route params from Next.js.
 *
 * Next.js App Router does NOT fully decode dynamic route params —
 * characters like colons stay as %3A. This helper ensures S3 keys
 * and other identifiers match their canonical (decoded) form.
 */
export function decodeRouteParams<T extends Record<string, string>>(params: T): T {
  const decoded = {} as Record<string, string>;
  for (const [key, value] of Object.entries(params)) {
    decoded[key] = decodeURIComponent(value);
  }
  return decoded as T;
}
