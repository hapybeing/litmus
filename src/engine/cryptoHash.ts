/**
 * Computes a real WebCrypto SHA-256 hex digest (8-char short fingerprint + full hash)
 * directly in the browser for reproducible audit provenance.
 */
export async function computeSha256Fingerprint(
  payload: string | ArrayBuffer | Uint8Array
): Promise<{ shortHash: string; fullHash: string }> {
  const bytes =
    typeof payload === 'string'
      ? new TextEncoder().encode(payload)
      : payload instanceof Uint8Array
        ? payload
        : new Uint8Array(payload);

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bufferCopy = new Uint8Array(bytes.byteLength);
    bufferCopy.set(bytes);
    const digest = await crypto.subtle.digest('SHA-256', bufferCopy.buffer);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return {
      shortHash: hex.slice(0, 8).toUpperCase(),
      fullHash: hex,
    };
  }

  // Deterministic fallback hash for non-WebCrypto environments (e.g. legacy test runners)
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < bytes.length; i++) {
    h1 ^= bytes[i];
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= bytes[i] + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const fallbackHex = ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).toUpperCase();
  return {
    shortHash: fallbackHex.slice(0, 8),
    fullHash: fallbackHex,
  };
}
