import type { NextRequest } from "next/server";

/**
 * Whether the auth cookie may carry the `Secure` attribute.
 *
 * This used to be `process.env.NODE_ENV === "production"`, which is wrong: the
 * Docker image sets NODE_ENV=production, so a deployment served over plain HTTP
 * (a VM's bare IP, a LAN host, any demo without TLS) marked the cookie Secure —
 * and browsers silently DISCARD Secure cookies on http:// origins. The user
 * appears to log in, then every request comes back 401.
 *
 * What actually matters is the transport, so detect that instead:
 *   - `x-forwarded-proto` when a proxy or load balancer terminates TLS
 *   - the request URL's own protocol otherwise
 */
export function shouldUseSecureCookie(req: NextRequest): boolean {
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  return req.nextUrl.protocol === "https:";
}
