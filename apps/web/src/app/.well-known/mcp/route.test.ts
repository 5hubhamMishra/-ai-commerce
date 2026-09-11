// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { GET, POST } from "./route";
import { SITE_URL } from "@/lib/site-url";

const endpoint = `${SITE_URL}/.well-known/mcp`;
const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };

describe("Veloura public MCP", () => {
  it("supports an SDK handshake, resource discovery and reading the real guidance", async () => {
    const client = new Client({ name: "remediation-check", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
      fetch: async (url, init) => {
        const request = new Request(url, init);
        return request.method === "POST" ? POST(request) : GET(request);
      },
    });
    try {
      await client.connect(transport);
      expect(client.getServerVersion()?.name).toBe("Veloura");
      expect(client.getServerCapabilities()?.tools).toBeUndefined();
      const { resources } = await client.listResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe(`${SITE_URL}/llms.txt`);
      const { contents } = await client.readResource({ uri: resources[0].uri });
      const [content] = contents;
      if (!("text" in content)) throw new Error("Expected a text resource");
      expect(content.text).toContain("## When to use Veloura");
      await expect(client.readResource({ uri: "file:///etc/passwd" })).rejects.toThrow();
    } finally {
      await client.close();
    }
  });

  it("serves discovery separately from unsupported SSE streams", async () => {
    const discovery = GET(new Request(endpoint));
    expect(discovery.status).toBe(200);
    expect(await discovery.json()).toMatchObject({ name: "Veloura", endpoint, transport: "streamable-http" });
    expect(GET(new Request(endpoint, { headers: { accept: "text/event-stream" } })).status).toBe(405);
  });

  it("rejects malformed JSON, invalid messages, unsupported versions and oversized bodies", async () => {
    for (const body of ["{", "null", "[]", JSON.stringify({ jsonrpc: "2.0", id: 1 })]) {
      const response = await POST(new Request(endpoint, { method: "POST", headers, body }));
      expect(response.status).toBe(400);
    }
    const version = await POST(new Request(endpoint, { method: "POST",
      headers: { ...headers, "mcp-protocol-version": "invalid" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }),
    }));
    expect(version.status).toBe(400);
    const oversized = await POST(new Request(endpoint, { method: "POST", headers, body: "x".repeat(16_385) }));
    expect(oversized.status).toBe(413);
  });

  it("rejects foreign and opaque origins before processing either method", async () => {
    for (const origin of ["https://untrusted.example", "null"]) {
      expect(GET(new Request(endpoint, { headers: { origin } })).status).toBe(403);
      expect((await POST(new Request(endpoint, { method: "POST", headers: { origin } }))).status).toBe(403);
    }
  });
});
