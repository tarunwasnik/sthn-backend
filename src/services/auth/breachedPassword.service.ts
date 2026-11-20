import crypto from "crypto";
import https from "https";
import { AppError } from "../../utils/AppError";

const HIBP_HOST = "api.pwnedpasswords.com";
const MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 3_000;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_LIMIT = 128;

export type BreachedPasswordTransport = (prefix: string, timeoutMs: number) => Promise<string>;
type CacheEntry = { suffixes: Set<string>; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const pendingRanges = new Map<string, Promise<Set<string>>>();

const unavailable = (): never => {
  throw new AppError("Password safety verification is temporarily unavailable. Please try again.", 503, "PASSWORD_SAFETY_UNAVAILABLE");
};

const timeoutMs = () => {
  const parsed = Number.parseInt(process.env.HIBP_PASSWORD_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10);
  return Number.isInteger(parsed) && parsed >= 500 && parsed <= 10_000 ? parsed : DEFAULT_TIMEOUT_MS;
};

const parseRange = (body: string) => {
  const suffixes = new Set<string>();
  if (!body) return suffixes;
  for (const line of body.split(/\r?\n/)) {
    if (!line) continue;
    const match = /^([A-Fa-f0-9]{35}):([0-9]+)$/.exec(line);
    if (!match) return unavailable();
    suffixes.add(match[1].toUpperCase());
  }
  return suffixes;
};

const requestOfficialRange: BreachedPasswordTransport = (prefix, requestTimeoutMs) => new Promise((resolve, reject) => {
  const request = https.request({
    protocol: "https:", hostname: HIBP_HOST, port: 443, method: "GET", path: `/range/${prefix}`,
    headers: { "Add-Padding": "true", "User-Agent": "STHN-password-safety" },
  }, (response) => {
    if (response.statusCode !== 200) { response.resume(); reject(new Error("Unexpected HIBP response status")); return; }
    let size = 0;
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_RESPONSE_BYTES) { request.destroy(new Error("HIBP range response too large")); return; }
      chunks.push(chunk);
    });
    response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    response.on("error", reject);
  });
  request.setTimeout(requestTimeoutMs, () => request.destroy(new Error("HIBP request timed out")));
  request.on("error", reject);
  request.end();
});

const rangeSuffixes = async (prefix: string, transport: BreachedPasswordTransport, now = Date.now()) => {
  const cached = cache.get(prefix);
  if (cached && cached.expiresAt > now) return cached.suffixes;
  const inFlight = pendingRanges.get(prefix);
  if (inFlight) return inFlight;
  const lookup = (async () => {
    try {
      const suffixes = parseRange(await transport(prefix, timeoutMs()));
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      cache.set(prefix, { suffixes, expiresAt: now + CACHE_TTL_MS });
      return suffixes;
    } catch (error) {
      if (error instanceof AppError) throw error;
      return unavailable();
    } finally {
      pendingRanges.delete(prefix);
    }
  })();
  pendingRanges.set(prefix, lookup);
  return lookup;
};

export const createBreachedPasswordChecker = (transport: BreachedPasswordTransport = requestOfficialRange) => async (password: string) => {
  const digest = crypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);
  const suffixes = await rangeSuffixes(prefix, transport);
  if (suffixes.has(suffix)) throw new AppError("This password has appeared in known data breaches. Choose a different password.", 400, "PASSWORD_BREACHED");
};

let activeTransport: BreachedPasswordTransport = requestOfficialRange;

export const assertPasswordNotBreached = (password: string) => createBreachedPasswordChecker(activeTransport)(password);

/** Test-only injection; production always uses the fixed official HTTPS transport. */
export const setBreachedPasswordTransportForTests = (transport: BreachedPasswordTransport) => {
  if (process.env.NODE_ENV !== "test") throw new Error("Breached-password transport can only be replaced in tests");
  activeTransport = transport;
  cache.clear();
  pendingRanges.clear();
};

export const clearBreachedPasswordCacheForTests = () => { cache.clear(); pendingRanges.clear(); };
