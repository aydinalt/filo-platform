import { createHmac, timingSafeEqual } from "node:crypto";

const providerSignatureWindowSeconds = 5 * 60;
const canonicalUnixSeconds = /^\d{10}$/u;
const providerSignature = /^(?:sha256=)?[a-f0-9]{64}$/iu;

export function isProviderSignatureEnvelopePlausible(
  timestamp: string | undefined,
  signature: string | undefined,
  now = Date.now(),
) {
  if (
    !timestamp ||
    !signature ||
    !canonicalUnixSeconds.test(timestamp) ||
    !providerSignature.test(signature)
  ) {
    return false;
  }
  const seconds = Number(timestamp);
  return Math.abs(Math.floor(now / 1000) - seconds) <= providerSignatureWindowSeconds;
}

export function verifyProviderSignature(
  payload: string,
  timestamp: string | undefined,
  signature: string | undefined,
  secret: string,
  now = Date.now(),
) {
  if (secret.length < 16 || !isProviderSignatureEnvelopePlausible(timestamp, signature, now)) {
    return false;
  }
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  const supplied = signature!.replace(/^sha256=/u, "");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"));
}
