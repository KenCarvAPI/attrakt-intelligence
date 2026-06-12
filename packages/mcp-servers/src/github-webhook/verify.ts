import crypto from 'crypto';

/**
 * Verify a GitHub webhook's `X-Hub-Signature-256` header.
 *
 * GitHub signs the raw request body with HMAC-SHA256 using the shared webhook
 * secret and sends it as `sha256=<hex>`. We recompute the digest over the exact
 * raw bytes and compare in constant time.
 *
 * Pure and side-effect free so it can be unit tested directly.
 *
 * @param rawBody   The raw, unparsed request body (Buffer or string).
 * @param signatureHeader  Value of the `X-Hub-Signature-256` header, e.g. "sha256=abc...".
 * @param secret    The configured webhook secret (GITHUB_WEBHOOK_SECRET).
 * @returns true only if the signature is present, well-formed, and matches.
 */
export function verifyGithubSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  // Missing secret or signature → reject.
  if (!secret || !signatureHeader) {
    return false;
  }

  // GitHub always uses the "sha256=" prefix for X-Hub-Signature-256.
  if (!signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  const received = Buffer.from(signatureHeader);
  const computed = Buffer.from(expected);

  // timingSafeEqual throws if lengths differ, so guard first.
  if (received.length !== computed.length) {
    return false;
  }

  return crypto.timingSafeEqual(received, computed);
}
