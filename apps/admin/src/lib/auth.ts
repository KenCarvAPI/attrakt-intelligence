/**
 * Shared-secret session gate.
 *
 * A single env-var password (ADMIN_PASSWORD) gates the whole dashboard. On a
 * correct password we set an HMAC-ish session cookie (SHA-256 of secret+password)
 * that middleware checks on every request. This is deliberately minimal — enough
 * to keep a sales-demo deployment private without standing up real auth.
 *
 * >>> CLERK INTEGRATION POINT <<<
 * Replace this module + middleware.ts with Clerk's middleware and <SignIn/>:
 *   - swap `isAuthed()` for `auth().userId`,
 *   - wrap the app in <ClerkProvider>, and
 *   - map Clerk orgs → clients for multi-tenant access control.
 * Everything else (server queries, route handlers) is auth-agnostic.
 */

export const SESSION_COOKIE = 'attrakt_session';

function secret(): string {
  return process.env.SESSION_SECRET || 'attrakt-dev-secret';
}

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'demo';
}

/** Compute the opaque session token for the configured password. Edge-safe. */
export async function sessionToken(): Promise<string> {
  const data = new TextEncoder().encode(`${secret()}:${adminPassword()}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** True when the provided cookie value is a valid session token. */
export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  return cookieValue === (await sessionToken());
}
