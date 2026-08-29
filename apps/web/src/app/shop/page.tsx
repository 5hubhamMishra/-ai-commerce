import { catalogApi } from "@ai-commerce/api-client";
import {
  demoBrands,
  demoCategories,
  listDemoProducts,
  mergeDemoProducts,
} from "@/lib/demo-catalog";
import ShopPageClient from "./ShopPageClient";

const PAGE_SIZE = 20;

async function fetchInitialProducts() {
  try {
    const result = await catalogApi.listProducts({
      page: 1,
      pageSize: PAGE_SIZE,
      sort: "newest",
    });
    return mergeDemoProducts(result, { pageSize: PAGE_SIZE, sort: "newest" });
  } catch {
    return listDemoProducts({ pageSize: PAGE_SIZE, sort: "newest" });
  }
}

async function fetchInitialCategories() {
  try {
    return await catalogApi.listCategories();
  } catch {
    return demoCategories;
  }
}

async function fetchInitialBrands() {
  try {
    return await catalogApi.listBrands();
  } catch {
    return demoBrands;
  }
}

export default async function ShopPage() {
  const [initialResult, initialCategories, initialBrands] = await Promise.all([
    fetchInitialProducts(),
    fetchInitialCategories(),
    fetchInitialBrands(),
  ]);

  return (
    <ShopPageClient
      initialResult={initialResult}
      initialCategories={initialCategories}
      initialBrands={initialBrands}
    />
  );
}
