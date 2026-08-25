import type { ProductListItem } from "@ai-commerce/types";
import { getDemoProductBySlug, listDemoProducts } from "./demo-catalog";

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type DemoProduct = ReturnType<typeof listDemoProducts>["items"][number];

export type ShopAIReply = {
  content: string;
  products: ProductListItem[];
  clearHistory?: boolean;
};

export type ShopAIQueryContext = {
  query: string;
  budget?: number;
  categoryTerm: string | null;
  categorySlug: string | null;
};

const UNAVAILABLE_REPLY =
  "I'm having trouble reaching the shopping assistant right now.";

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractBudget(text: string): number | undefined {
  const compact = text.replace(/,/g, "");
  const match = compact.match(
    /(?:under|below|less than|upto|up to|within|budget)\s*(?:rs\.?|₹|inr)?\s*(\d{4,7})/i,
  );
  if (match) return Number(match[1]);

  const followUpMatch = compact.match(
    /(?:what about|how about|then|around|for|at)\s*(?:rs\.?|₹|inr)?\s*(\d{4,7})/i,
  );
  return followUpMatch ? Number(followUpMatch[1]) : undefined;
}

function mentionsCategory(text: string): boolean {
  const q = normalize(text);
  return /laptop|headphone|earphone|phone|mobile|watch|wearable|fitness|camera|vlog|speaker|audio|mouse|ssd|power bank/.test(
    q,
  );
}

export function extractCategoryTerm(text: string): string | null {
  const q = normalize(text);
  if (q.includes("laptop")) return "laptop";
  if (q.includes("headphone") || q.includes("earphone")) return "headphone";
  if (q.includes("phone") || q.includes("mobile")) return "phone";
  if (q.includes("watch") || q.includes("wearable") || q.includes("fitness")) {
    return "watch";
  }
  if (q.includes("camera") || q.includes("vlog")) return "camera";
  if (q.includes("speaker") || q.includes("audio")) return "speaker";
  if (q.includes("mouse") || q.includes("ssd") || q.includes("power bank")) {
    return "accessory";
  }
  return null;
}

function categorySlugFromTerm(term: string | null): string | null {
  if (term === "laptop") return "laptops";
  if (term === "headphone") return "headphones";
  if (term === "phone") return "smartphones";
  if (term === "watch") return "wearables";
  if (term === "camera") return "cameras";
  if (term === "speaker") return "home-audio";
  if (term === "accessory") return "accessories";
  return null;
}

function isClearRequest(text: string): boolean {
  return /^(clear|reset|start over|new chat|restart)$/i.test(text.trim());
}

function isConversationalRequest(text: string): boolean {
  const q = normalize(text);
  return /^(hi|hello|hey|thanks|thank you|ok|okay|who are you|what can you do|help)$/.test(
    q,
  );
}

function inferQuery(history: ChatTurn[]): string {
  const userTurns = history.filter((turn) => turn.role === "user");
  const latest = userTurns.at(-1)?.content ?? "";
  const latestNormalized = normalize(latest);

  if (
    /listed here|these items|that list|the list|items listed/i.test(
      latestNormalized,
    ) &&
    userTurns.length > 1
  ) {
    return userTurns.at(-2)?.content ?? latest;
  }

  if (!mentionsCategory(latest) && extractBudget(latest) !== undefined) {
    const previousCategoryTurn = userTurns
      .slice(0, -1)
      .reverse()
      .find((turn) => mentionsCategory(turn.content));
    if (previousCategoryTurn) {
      const category = extractCategoryTerm(previousCategoryTurn.content);
      return category ? `${category} ${latest}` : latest;
    }
  }

  return latest;
}

function matchesQuery(product: DemoProduct, query: string): boolean {
  const q = normalize(query);
  const haystack = normalize(
    [product.name, product.brand?.name, product.category.name, product.slug]
      .filter(Boolean)
      .join(" "),
  );

  if (q.includes("laptop")) return product.category.slug === "laptops";
  if (q.includes("headphone") || q.includes("earphone")) {
    return product.category.slug === "headphones";
  }
  if (q.includes("phone") || q.includes("mobile")) {
    return product.category.slug === "smartphones";
  }
  if (q.includes("watch") || q.includes("wearable") || q.includes("fitness")) {
    return product.category.slug === "wearables";
  }
  if (q.includes("camera") || q.includes("vlog")) {
    return product.category.slug === "cameras";
  }
  if (q.includes("speaker") || q.includes("audio")) {
    return product.category.slug === "home-audio";
  }
  if (q.includes("mouse") || q.includes("ssd") || q.includes("power bank")) {
    return product.category.slug === "accessories";
  }

  return q
    .split(" ")
    .filter((part) => part.length > 2)
    .some((part) => haystack.includes(part));
}

function formatProduct(product: DemoProduct, index: number): string {
  const price =
    product.minPrice == null
      ? "price not listed"
      : new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: product.currency,
          maximumFractionDigits: 0,
        }).format(product.minPrice);

  return `${index + 1}. ${product.name} — ${price}${product.brand ? `, ${product.brand.name}` : ""}`;
}

function formatListProduct(product: ProductListItem, index: number): string {
  const price =
    product.minPrice == null
      ? "price not listed"
      : new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: product.currency,
          maximumFractionDigits: 0,
        }).format(product.minPrice);

  return `${index + 1}. ${product.name} — ${price}${product.brand ? `, ${product.brand.name}` : ""}`;
}

export function isShopAIUnavailableReply(content: string): boolean {
  return content.includes(UNAVAILABLE_REPLY);
}

export function getShopAIQueryContext(history: ChatTurn[]): ShopAIQueryContext {
  const query = inferQuery(history);
  const categoryTerm = extractCategoryTerm(query);
  return {
    query,
    budget: extractBudget(query),
    categoryTerm,
    categorySlug: categorySlugFromTerm(categoryTerm),
  };
}

function selectDemoProducts(history: ChatTurn[]): {
  products: DemoProduct[];
  budget?: number;
  matchQuality: "exact" | "no-budget-match" | "featured";
} {
  const query = inferQuery(history);
  const budget = extractBudget(query);
  const matchingProducts = listDemoProducts({ pageSize: 100 }).items.filter(
    (product) => matchesQuery(product, query),
  );
  const products = matchingProducts
    .filter(
      (product) => budget === undefined || (product.minPrice ?? 0) <= budget,
    )
    .slice(0, 6);

  if (products.length > 0) {
    return { products, budget, matchQuality: "exact" };
  }

  if (matchingProducts.length > 0 && budget !== undefined) {
    return {
      products: [],
      budget,
      matchQuality: "no-budget-match",
    };
  }

  return {
    products: listDemoProducts({ featured: true, pageSize: 6 }).items,
    matchQuality: "featured",
  };
}

export function findDemoProductsInReply(content: string): DemoProduct[] {
  const normalizedContent = normalize(content);
  return listDemoProducts({ pageSize: 100 }).items.filter((product) =>
    normalizedContent.includes(normalize(product.name)),
  );
}

export function createCatalogShopAIReply(
  history: ChatTurn[],
  products: ProductListItem[],
): ShopAIReply {
  const { budget, categoryTerm } = getShopAIQueryContext(history);

  if (products.length === 0 && budget !== undefined) {
    return {
      content: [
        `I could not find a matching ${categoryTerm ?? "product"} at or under ${new Intl.NumberFormat(
          "en-IN",
          {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 0,
          },
        ).format(budget)}.`,
        "",
        "I will not show over-budget products for that request. Try raising the budget or searching a broader category.",
      ].join("\n"),
      products: [],
    };
  }

  if (products.length === 0) {
    return {
      content:
        "I could not find a matching product in the catalog. Try a different category, brand, or budget.",
      products: [],
    };
  }

  const lines = products.slice(0, 6).map(formatListProduct);
  const first = products[0];

  return {
    content: [
      "Here are the best matches I found in the catalog:",
      "",
      ...lines,
      "",
      `My quick pick: ${first.name}.`,
      "Open any product card to view the full specs, image, price, and cart action.",
    ].join("\n"),
    products,
  };
}

export function createDemoShopAIReply(history: ChatTurn[]): ShopAIReply {
  const latestUserTurn =
    history.filter((turn) => turn.role === "user").at(-1)?.content ?? "";

  if (isClearRequest(latestUserTurn)) {
    return {
      content:
        "Cleared. What would you like to shop for next? Tell me a category, budget, brand, or use case.",
      products: [],
      clearHistory: true,
    };
  }

  if (isConversationalRequest(latestUserTurn)) {
    return {
      content:
        'I can help you find products by category, budget, brand, or use case. For example: "phones under 70000", "headphones for gym", or "laptop for coding".',
      products: [],
    };
  }

  const {
    products: fallbackProducts,
    budget,
    matchQuality,
  } = selectDemoProducts(history);

  const heading = {
    exact: "Here are the best matches I can show from the catalog:",
    "no-budget-match":
      budget === undefined
        ? "I could not find a matching product in the catalog."
        : `I could not find a matching product at or under ${new Intl.NumberFormat(
            "en-IN",
            {
              style: "currency",
              currency: "INR",
              maximumFractionDigits: 0,
            },
          ).format(budget)}.`,
    featured:
      "I could not find an exact match, but these are strong featured picks:",
  }[matchQuality];

  if (matchQuality === "no-budget-match") {
    return {
      content: [
        heading,
        "",
        "I will not show over-budget products for that request. Try raising the budget or searching a broader category.",
      ].join("\n"),
      products: [],
    };
  }

  const lines = fallbackProducts.map(formatProduct);
  const firstSlug = fallbackProducts[0]?.slug;
  const detail = firstSlug ? getDemoProductBySlug(firstSlug) : null;
  const specHint = detail?.specifications
    .slice(0, 2)
    .map((spec) => `${spec.key}: ${spec.value}`)
    .join("; ");

  return {
    content: [
      heading,
      "",
      ...lines,
      "",
      specHint
        ? `My quick pick: ${fallbackProducts[0].name}. ${specHint}.`
        : `My quick pick: ${fallbackProducts[0]?.name ?? "start with the featured list"}.`,
      "Open any product card to view the full specs, image, price, and cart action.",
    ].join("\n"),
    products: fallbackProducts,
  };
}
