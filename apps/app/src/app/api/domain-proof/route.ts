import { domainProof } from "@/server/custom-hostnames";

/** Answers with this install's proof for the host it was reached on, so domain verification can tell it's us. */
export async function GET(req: Request) {
  const host = (req.headers.get("host") ?? "").split(":")[0]!.toLowerCase();
  return new Response(domainProof(host), {
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });
}
