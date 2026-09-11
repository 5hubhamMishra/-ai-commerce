import { readFile } from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ErrorCode, JSONRPCMessageSchema, McpError, SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { SITE_URL } from "@/lib/site-url";

export const runtime = "nodejs";

function rejectRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== SITE_URL) {
    return new Response("Forbidden origin", { status: 403 });
  }
  const version = request.headers.get("mcp-protocol-version");
  if (version && !SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
    return new Response("Unsupported MCP protocol version", { status: 400 });
  }
}

export function GET(request: Request) {
  const rejected = rejectRequest(request);
  if (rejected) return rejected;
  if (request.headers.get("accept")?.includes("text/event-stream")) {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  return Response.json({
    name: "Veloura", version: "1.0.0",
    description: "Read-only Veloura public site guidance.",
    transport: "streamable-http",
    endpoint: `${SITE_URL}/.well-known/mcp`,
    documentation: `${SITE_URL}/developers`,
  }, { headers: { Vary: "Accept, Origin" } });
}

export async function POST(request: Request) {
  const rejected = rejectRequest(request);
  if (rejected) return rejected;

  // Bound the body even when a client omits Content-Length or uses chunked encoding.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        return new Response("Request too large", { status: 413 });
      }
      chunks.push(value);
    }
  }
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null,
      error: { code: -32700, message: "Invalid JSON" },
    }, { status: 400 });
  }
  if (!JSONRPCMessageSchema.safeParse(parsedBody).success) {
    return Response.json({ jsonrpc: "2.0", id: null,
      error: { code: -32600, message: "Expected one JSON-RPC message" },
    }, { status: 400 });
  }
  const server = new McpServer({ name: "Veloura", version: "1.0.0" });
  server.registerResource("veloura-guidance", `${SITE_URL}/llms.txt`, {
    title: "Veloura agent guidance", mimeType: "text/plain",
    description: "When to use Veloura and where to find public catalog resources.",
  }, async (uri) => {
    try {
      const text = await readFile(path.join(process.cwd(), "public", "llms.txt"), "utf8");
      return { contents: [{ uri: uri.href, mimeType: "text/plain", text }] };
    } catch {
      throw new McpError(ErrorCode.InternalError, "Public guidance is temporarily unavailable.");
    }
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request, { parsedBody });
  } finally {
    await server.close();
  }
}
