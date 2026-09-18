import { SITE_URL } from "@/lib/site-url";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "") ||
  "http://localhost:4000/api/v1";

const errorResponse = {
  description: "Structured API error.",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorResponse" },
    },
  },
};

const productListQuery = [
  { $ref: "#/components/parameters/Page" },
  { $ref: "#/components/parameters/PageSize" },
  { name: "category", in: "query", schema: { type: "string" } },
  { name: "brand", in: "query", schema: { type: "string" } },
  { name: "tag", in: "query", schema: { type: "string" } },
  { name: "search", in: "query", schema: { type: "string" } },
  { name: "minPrice", in: "query", schema: { type: "number", minimum: 0 } },
  { name: "maxPrice", in: "query", schema: { type: "number", minimum: 0 } },
  { name: "featured", in: "query", schema: { type: "boolean" } },
  {
    name: "sort",
    in: "query",
    schema: { type: "string", enum: ["newest", "name_asc", "featured"] },
  },
];

const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Veloura public API",
    version: "1.0.0",
    description:
      "Read-only catalog, search, comparison, recommendation, seller storefront, and health endpoints supported by Veloura. Private account, checkout, payment, refund, and administration routes are intentionally excluded.",
  },
  servers: [{ url: API_URL, description: "Veloura API" }],
  externalDocs: {
    description: "Veloura developer resources",
    url: `${SITE_URL}/developers`,
  },
  tags: [
    {
      name: "Catalog",
      description: "Public products, categories, and brands.",
    },
    {
      name: "Discovery",
      description: "Search, comparison, and recommendations.",
    },
    { name: "Sellers", description: "Public verified seller storefronts." },
    { name: "Health", description: "Liveness and readiness checks." },
  ],
  paths: {
    "/products": {
      get: {
        operationId: "listPublicProducts",
        tags: ["Catalog"],
        summary: "List active products",
        parameters: productListQuery,
        responses: {
          "200": {
            description: "Paginated active product list.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProductPage" },
              },
            },
          },
          "400": errorResponse,
          "429": errorResponse,
        },
      },
    },
    "/products/{slug}": {
      get: {
        operationId: "getPublicProduct",
        tags: ["Catalog"],
        summary: "Get an active product by slug",
        parameters: [{ $ref: "#/components/parameters/ProductSlug" }],
        responses: {
          "200": {
            description: "Product detail.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Product" },
              },
            },
          },
          "404": errorResponse,
        },
      },
    },
    "/products/{slug}/reviews": {
      get: {
        operationId: "listProductReviews",
        tags: ["Catalog"],
        summary: "List public product reviews",
        parameters: [
          { $ref: "#/components/parameters/ProductSlug" },
          { $ref: "#/components/parameters/Page" },
          { $ref: "#/components/parameters/PageSize" },
        ],
        responses: {
          "200": { description: "Paginated product reviews." },
          "404": errorResponse,
        },
      },
    },
    "/categories": {
      get: {
        operationId: "listCategories",
        tags: ["Catalog"],
        summary: "List the active category tree",
        responses: { "200": { description: "Active categories." } },
      },
    },
    "/categories/{slug}": {
      get: {
        operationId: "getCategory",
        tags: ["Catalog"],
        summary: "Get an active category",
        parameters: [{ $ref: "#/components/parameters/Slug" }],
        responses: {
          "200": { description: "Category detail." },
          "404": errorResponse,
        },
      },
    },
    "/categories/{slug}/products": {
      get: {
        operationId: "listCategoryProducts",
        tags: ["Catalog"],
        summary: "List products in an active category",
        parameters: [
          { $ref: "#/components/parameters/Slug" },
          ...productListQuery,
        ],
        responses: {
          "200": { description: "Paginated category product list." },
          "404": errorResponse,
        },
      },
    },
    "/brands": {
      get: {
        operationId: "listBrands",
        tags: ["Catalog"],
        summary: "List active brands",
        responses: { "200": { description: "Active brands." } },
      },
    },
    "/brands/{slug}": {
      get: {
        operationId: "getBrand",
        tags: ["Catalog"],
        summary: "Get an active brand",
        parameters: [{ $ref: "#/components/parameters/Slug" }],
        responses: {
          "200": { description: "Brand detail." },
          "404": errorResponse,
        },
      },
    },
    "/brands/{slug}/products": {
      get: {
        operationId: "listBrandProducts",
        tags: ["Catalog"],
        summary: "List products for an active brand",
        parameters: [
          { $ref: "#/components/parameters/Slug" },
          ...productListQuery,
        ],
        responses: {
          "200": { description: "Paginated brand product list." },
          "404": errorResponse,
        },
      },
    },
    "/search": {
      get: {
        operationId: "searchProducts",
        tags: ["Discovery"],
        summary: "Search the public catalog",
        parameters: [
          {
            name: "q",
            in: "query",
            schema: { type: "string", maxLength: 200 },
          },
          ...productListQuery,
          {
            name: "anonymousId",
            in: "query",
            schema: { type: "string", maxLength: 100 },
          },
        ],
        responses: {
          "200": { description: "Search results with pagination." },
          "400": errorResponse,
          "429": errorResponse,
        },
      },
    },
    "/comparison": {
      get: {
        operationId: "compareProducts",
        tags: ["Discovery"],
        summary: "Compare two to four products",
        parameters: [
          {
            name: "ids",
            in: "query",
            required: true,
            description: "Comma-separated product UUIDs.",
            schema: { type: "string", minLength: 73 },
          },
        ],
        responses: {
          "200": { description: "Comparison result." },
          "400": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/recommendations": {
      get: {
        operationId: "listRecommendations",
        tags: ["Discovery"],
        summary: "List personalized or anonymous recommendations",
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 50, default: 10 },
          },
          {
            name: "anonymousId",
            in: "query",
            schema: { type: "string", maxLength: 100 },
          },
        ],
        responses: {
          "200": { description: "Recommendation list." },
          "429": errorResponse,
        },
      },
    },
    "/recommendations/trending": {
      get: {
        operationId: "listTrendingRecommendations",
        tags: ["Discovery"],
        summary: "List trending recommendations",
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 50, default: 10 },
          },
        ],
        responses: { "200": { description: "Trending recommendation list." } },
      },
    },
    "/recommendations/similar/{productId}": {
      get: {
        operationId: "listSimilarRecommendations",
        tags: ["Discovery"],
        summary: "List products similar to a product",
        parameters: [
          { $ref: "#/components/parameters/ProductId" },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 50, default: 10 },
          },
        ],
        responses: {
          "200": { description: "Similar products." },
          "404": errorResponse,
        },
      },
    },
    "/recommendations/frequently-bought-with/{productId}": {
      get: {
        operationId: "listFrequentlyBoughtWithRecommendations",
        tags: ["Discovery"],
        summary: "List frequently bought together products",
        parameters: [
          { $ref: "#/components/parameters/ProductId" },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 50, default: 10 },
          },
        ],
        responses: {
          "200": { description: "Frequently bought together products." },
          "404": errorResponse,
        },
      },
    },
    "/sellers/{slug}": {
      get: {
        operationId: "getPublicSeller",
        tags: ["Sellers"],
        summary: "Get a verified seller storefront",
        parameters: [{ $ref: "#/components/parameters/Slug" }],
        responses: {
          "200": { description: "Public seller profile." },
          "404": errorResponse,
        },
      },
    },
    "/sellers/{slug}/products": {
      get: {
        operationId: "listSellerProducts",
        tags: ["Sellers"],
        summary: "List products in a verified seller storefront",
        parameters: [
          { $ref: "#/components/parameters/Slug" },
          ...productListQuery,
        ],
        responses: {
          "200": { description: "Paginated seller product list." },
          "404": errorResponse,
        },
      },
    },
    "/health": {
      get: {
        operationId: "healthCheck",
        tags: ["Health"],
        summary: "Check API process health",
        servers: [{ url: API_URL.replace(/\/api\/v1$/, "") }],
        responses: { "200": { description: "Process is healthy." } },
      },
    },
    "/ready": {
      get: {
        operationId: "readinessCheck",
        tags: ["Health"],
        summary: "Check API dependency readiness",
        servers: [{ url: API_URL.replace(/\/api\/v1$/, "") }],
        responses: {
          "200": { description: "Dependencies are reachable." },
          "503": errorResponse,
        },
      },
    },
  },
  components: {
    parameters: {
      Page: {
        name: "page",
        in: "query",
        schema: { type: "integer", minimum: 1, default: 1 },
      },
      PageSize: {
        name: "pageSize",
        in: "query",
        schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      Slug: {
        name: "slug",
        in: "path",
        required: true,
        schema: { type: "string", minLength: 1, maxLength: 200 },
      },
      ProductSlug: {
        name: "slug",
        in: "path",
        required: true,
        schema: { type: "string", minLength: 1, maxLength: 200 },
      },
      ProductId: {
        name: "productId",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message", "requestId"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              requestId: { type: "string" },
              details: { type: "object", additionalProperties: true },
            },
          },
        },
      },
      Product: {
        type: "object",
        required: ["id", "slug", "name"],
        properties: {
          id: { type: "string", format: "uuid" },
          slug: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          variants: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
          images: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
        },
        additionalProperties: true,
      },
      ProductPage: {
        type: "object",
        required: ["items", "total", "page", "pageSize"],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/Product" },
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          pageSize: { type: "integer", minimum: 1, maximum: 100 },
        },
      },
    },
  },
} as const;

export function GET() {
  return Response.json(openapi, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
