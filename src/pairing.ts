import { createHash, randomBytes } from "node:crypto";
import { serviceOrigin, trustedBrowserUrl, ServiceError } from "./client.js";
import type { SessionStore } from "./store.js";

export interface PairingOptions {
  origin: string; store: Pick<SessionStore, "save">;
  showUrl: (url: string) => Promise<void>;
  fetcher?: typeof fetch; pause?: (ms: number) => Promise<void>; now?: () => number;
}

export async function pair(options: PairingOptions): Promise<void> {
  const origin = serviceOrigin(options.origin), request = options.fetcher ?? fetch;
  const pause = options.pause ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const init = await request(`${origin}/v1/pairings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challenge }), redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!init.ok) throw new ServiceError(init.status, "pairing_failed");
  const pairing = await init.json() as { id: string; verificationUrl: string; expiresAt: string };
  if (!/^[a-zA-Z0-9_-]+$/.test(pairing.id)) throw new Error("Invalid pairing response.");
  const expiration = Date.parse(pairing.expiresAt);
  if (!Number.isFinite(expiration) || expiration <= now()) throw new Error("Pairing already expired.");
  const deadline = Math.min(expiration, now() + 15 * 60_000);
  await options.showUrl(trustedBrowserUrl(origin, pairing.verificationUrl));
  while (now() < deadline) {
    await pause(2000);
    const response = await request(`${origin}/v1/pairings/${pairing.id}/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ verifier }), redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (response.status === 202) continue;
    if (!response.ok) throw new ServiceError(response.status, "pairing_rejected");
    const result = await response.json() as { token?: string };
    if (!result.token || typeof result.token !== "string") throw new Error("Pairing did not return an application session.");
    await options.store.save({ origin, token: result.token, savedAt: new Date(now()).toISOString() });
    return;
  }
  throw new Error("Login timed out. Run login again to start a new pairing.");
}
