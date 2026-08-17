/**
 * Seeds the Phase 2 catalog schema from the original static JSON the Next.js app
 * shipped with (apps/web/src/lib/data/*.json, copied into prisma/seed-data so this
 * script doesn't reach into another workspace package's internals). Idempotent: skips
 * entirely if any product already exists, so re-running `prisma db seed` is safe.
 */
import { PrismaClient, ProductStatus } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { slugify } from '../src/common/utils/slugify';

type RawProduct = {
  id: string;
  name: string;
  brand: string;
  category: string;
  subcategory?: string;
  price: number;
  compareAtPrice?: number;
  rating: number;
  reviewCount: number;
  description: string;
  specs: Record<string, string>;
  tags: string[];
  images: string[];
  stock: number;
  featured?: boolean;
  useCases?: string[];
};

type RawCategory = { name: string; slug: string; brands: string[] };

const COLOR_VALUES = ['Black', 'White', 'Silver', 'Blue', 'Red', 'Graphite', 'Gold', 'Green'];

function hashToIndex(input: string, modulo: number): number {
  let hash = 0;
  for (const char of input) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % modulo;
}

export async function seedCatalog(prisma: PrismaClient): Promise<void> {
  const existingProductCount = await prisma.product.count();
  if (existingProductCount > 0) {
    console.log(`Catalog already seeded (${existingProductCount} products) — skipping.`);
    return;
  }

  const categoriesRaw = JSON.parse(
    readFileSync(join(__dirname, 'seed-data', 'categories.json'), 'utf-8'),
  ) as RawCategory[];
  const productsRaw = JSON.parse(
    readFileSync(join(__dirname, 'seed-data', 'products.json'), 'utf-8'),
  ) as RawProduct[];

  const warehouse = await prisma.warehouse.create({
    data: {
      name: 'Primary Fulfillment Center',
      code: 'MAIN',
      line1: '1 Distribution Way',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
      country: 'India',
    },
  });

  const colorAttribute = await prisma.attribute.create({
    data: {
      name: 'Color',
      slug: 'color',
      values: {
        create: COLOR_VALUES.map((value) => ({ value, slug: slugify(value) })),
      },
    },
    include: { values: true },
  });
  const colorValueIdByName = new Map(colorAttribute.values.map((v) => [v.value, v.id]));

  const categoryIdBySlug = new Map<string, string>();
  for (const [index, cat] of categoriesRaw.entries()) {
    const category = await prisma.category.create({
      data: { name: cat.name, slug: cat.slug, sortOrder: index, isActive: true },
    });
    categoryIdBySlug.set(cat.slug, category.id);
  }

  const brandNames = [...new Set(productsRaw.map((p) => p.brand))];
  const brandIdByName = new Map<string, string>();
  for (const name of brandNames) {
    const brand = await prisma.brand.create({ data: { name, slug: slugify(name), isActive: true } });
    brandIdByName.set(name, brand.id);
  }

  const tagIdBySlug = new Map<string, string>();
  let skipped = 0;

  for (const p of productsRaw) {
    const categorySlug = categoriesRaw.find((c) => c.name === p.category)?.slug;
    const categoryId = categorySlug ? categoryIdBySlug.get(categorySlug) : undefined;
    if (!categoryId) {
      console.warn(`Skipping product "${p.name}" — unrecognized category "${p.category}".`);
      skipped += 1;
      continue;
    }

    const color = COLOR_VALUES[hashToIndex(p.id, COLOR_VALUES.length)];
    const colorValueId = colorValueIdByName.get(color)!;

    const product = await prisma.product.create({
      data: {
        name: p.name,
        slug: `${slugify(p.name)}-${p.id}`,
        description: p.description,
        categoryId,
        brandId: brandIdByName.get(p.brand),
        status: ProductStatus.ACTIVE,
        isFeatured: p.featured ?? false,
        specifications: {
          create: Object.entries(p.specs).map(([key, value], sortOrder) => ({
            key,
            value,
            sortOrder,
          })),
        },
        images: {
          create: p.images.map((url, sortOrder) => ({ url, sortOrder, isPrimary: sortOrder === 0 })),
        },
        variants: {
          create: [
            {
              sku: `SKU-${p.id.toUpperCase()}`,
              price: p.price,
              compareAtPrice: p.compareAtPrice,
              currency: 'INR',
              isDefault: true,
              isActive: true,
              attributeValues: { create: [{ attributeValueId: colorValueId }] },
            },
          ],
        },
      },
      include: { variants: true },
    });

    for (const tagName of p.tags) {
      const slug = slugify(tagName);
      let tagId = tagIdBySlug.get(slug);
      if (!tagId) {
        const tag = await prisma.tag.create({ data: { name: tagName, slug } });
        tagId = tag.id;
        tagIdBySlug.set(slug, tagId);
      }
      await prisma.productTagAssignment.create({ data: { productId: product.id, tagId } });
    }

    await prisma.inventory.create({
      data: {
        variantId: product.variants[0].id,
        warehouseId: warehouse.id,
        quantityOnHand: p.stock,
        reorderPoint: 10,
      },
    });
  }

  console.log(
    `Seeded catalog: ${categoriesRaw.length} categories, ${brandIdByName.size} brands, ` +
      `${productsRaw.length - skipped} products (${skipped} skipped), 1 warehouse, ` +
      `1 attribute (${COLOR_VALUES.length} values).`,
  );
}
