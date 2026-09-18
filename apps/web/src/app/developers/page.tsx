import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Developer resources",
  description: "Veloura public catalog resources, agent guidance, and read-only MCP connection instructions.",
  alternates: { canonical: "/developers" },
};

export default function DevelopersPage() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
      <h1 className="font-display text-4xl font-semibold text-[var(--clr-text-primary)]">
        Veloura developer resources
      </h1>
      <p className="mt-5 leading-relaxed text-[var(--clr-text-secondary)]">
        Discover public product and category pages through the XML sitemap.
        Product pages include structured product information. Read current pages
        for prices and availability; account and purchase flows use the shopper&apos;s session.
      </p>
      <nav aria-label="Public developer resources" className="mt-8 flex flex-wrap gap-3">
        <a href="/llms.txt" className="btn">Agent guidance (text)</a>
        <a href="/sitemap.xml" className="btn">Sitemap (XML)</a>
        <a href="/openapi.json" className="btn">OpenAPI (JSON)</a>
        <a href="/robots.txt" className="btn">Crawler guidance (text)</a>
        <Link href="/shop" className="btn">Public catalog</Link>
      </nav>
      <h2 className="mt-10 font-display text-2xl font-semibold">Read-only MCP access</h2>
      <p className="mt-4 leading-relaxed text-[var(--clr-text-secondary)]">
        Connect an MCP client using Streamable HTTP at <code>{SITE_URL}/.well-known/mcp</code>.
        No credentials are needed for public guidance. Send POST requests with
        Content-Type: application/json and Accept: application/json, text/event-stream.
        Initialize the connection, send notifications/initialized, then use
        resources/list and resources/read to retrieve Veloura&apos;s agent guidance.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-xl bg-[var(--clr-surface-2)] p-4 text-sm">
        {JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2025-06-18", capabilities: {},
          clientInfo: { name: "veloura-reader", version: "1.0.0" },
        } }, null, 2)}
      </pre>
      <p className="mt-4 leading-relaxed text-[var(--clr-text-secondary)]">
        Use the negotiated MCP-Protocol-Version header on subsequent requests.
        This endpoint is stateless and returns JSON responses. GET without an
        event-stream request returns discovery information; standalone event
        streams are not supported (HTTP 405). Only site guidance is exposed:
        catalog search, recommendations, ShopAI, and purchase actions remain in the storefront.
      </p>
    </section>
  );
}
