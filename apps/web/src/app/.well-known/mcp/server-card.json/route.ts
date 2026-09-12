import { SITE_URL } from "@/lib/site-url";

export function GET() {
  return Response.json({
    name: "Veloura",
    version: "1.0.0",
    description: "Read-only Veloura public site guidance and when-to-use instructions.",
    icon: `${SITE_URL}/icon-512.svg`,
    url: `${SITE_URL}/.well-known/mcp`,
    serverUrl: `${SITE_URL}/.well-known/mcp`,
    transport: "streamable-http",
    capabilities: { resources: true, tools: false },
    tools: [],
  });
}
