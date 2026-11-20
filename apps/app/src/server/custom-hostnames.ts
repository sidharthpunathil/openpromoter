import { hmacHex, safeEqual } from "@/lib/crypto";
import { env } from "@/server/env";
import { safeFetch } from "@/server/safe-fetch";

/**
 * Cloudflare for SaaS custom hostnames: Cloudflare issues and renews the TLS certificate for each
 * founder's domain (partners.acme.com). Off unless CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID are set;
 * self-hosters keep plain CNAME checks and their own proxy's certificates.
 */
export const cloudflareOn = () => !!(env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ZONE_ID);

/** What founders point their CNAME at. */
export const cnameTarget = () => env.CUSTOM_DOMAIN_TARGET || new URL(env.APP_URL).hostname;

/** Path that answers with domainProof() for the host it was reached on. */
export const DOMAIN_PROOF_PATH = "/api/domain-proof";

/** What this install answers at DOMAIN_PROOF_PATH on `host`. Another install, with another secret, answers differently. */
export const domainProof = (host: string) =>
  hmacHex(
    process.env.BETTER_AUTH_SECRET || process.env.ENCRYPTION_KEY || "op",
    `domain-proof:${host.toLowerCase()}`,
  );

/**
 * True when https://<host> is served by this install. Hosts like Railway give each custom domain its own CNAME
 * target, so the CNAME can't be compared with cnameTarget(); what matters is that the domain reaches this app.
 */
export async function reachesThisApp(host: string): Promise<boolean> {
  const res = await safeFetch(`https://${host}${DOMAIN_PROOF_PATH}`, {
    maxRedirects: 0,
    maxBytes: 1000,
    timeoutMs: 8000,
  }).catch(() => null);
  return !!res && res.status === 200 && safeEqual(res.text.trim(), domainProof(host));
}

type Hostname = { id: string; hostname: string; status: string; ssl?: { status?: string } };

async function cf<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/custom_hostnames${path}`,
    {
      ...init,
      headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    },
  ).catch(() => null);
  const body = (await res?.json().catch(() => null)) as {
    success?: boolean;
    result?: T;
    errors?: { message?: string }[];
  } | null;
  if (!res?.ok || !body?.success) {
    // Cloudflare's own message (e.g. "Duplicate custom hostname found") is safe to show; the token never is.
    const msg = body?.errors?.[0]?.message;
    throw new Error(msg ? `Cloudflare: ${msg}` : "Couldn't reach Cloudflare. Try again in a minute.");
  }
  return body.result as T;
}

export async function findHostname(hostname: string): Promise<Hostname | null> {
  const list = await cf<Hostname[]>(`?hostname=${encodeURIComponent(hostname)}`);
  return list.find((h) => h.hostname === hostname) ?? null;
}

export async function addHostname(hostname: string): Promise<Hostname> {
  return (
    (await findHostname(hostname)) ??
    cf<Hostname>("", {
      method: "POST",
      body: JSON.stringify({ hostname, ssl: { method: "http", type: "dv" } }),
    })
  );
}

export async function removeHostname(hostname: string): Promise<void> {
  const h = await findHostname(hostname);
  if (h) await cf(`/${h.id}`, { method: "DELETE" });
}

/** null when the domain serves HTTPS, otherwise a line telling the founder what Cloudflare is waiting on. */
export async function hostnameProblem(hostname: string): Promise<string | null> {
  const h = await findHostname(hostname);
  if (!h) return "This domain isn't registered yet. Save it again.";
  if (h.status === "active" && h.ssl?.status === "active") return null;
  if (h.status !== "active")
    return `Waiting for DNS. Add a CNAME from ${hostname} to ${cnameTarget()}. DNS can take a few minutes.`;
  return "DNS is set. Cloudflare is issuing the certificate. This usually takes a few minutes.";
}
