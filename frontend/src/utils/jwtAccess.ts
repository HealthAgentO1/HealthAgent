/**
 * Client-side JWT payload inspection (no signature verification).
 * Used to avoid treating a stale access token in localStorage as a live session.
 */

function base64UrlToJson(payloadB64: string): Record<string, unknown> | null {
  try {
    let b64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad) b64 += "=".repeat(4 - pad);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    const data = JSON.parse(json) as Record<string, unknown>;
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

/** Parse JWT payload; returns null if the string is not a valid JWT shape. */
export function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  return base64UrlToJson(parts[1]);
}

/**
 * True if the access token has a numeric `exp` in the future (with clock skew).
 * False for missing/invalid token or malformed/expired payload.
 */
export function isAccessTokenValid(
  token: string | null | undefined,
  clockSkewSeconds = 30,
): boolean {
  if (!token || typeof token !== "string") return false;
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return false;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp > now + clockSkewSeconds;
}
