import { PrismaClient, ProductStatus } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { slugify } from '../src/common/utils/slugify';

type RawPresentationProduct = {
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

const COLOR_VALUES = [
  'Black',
  'White',
  'Silver',
  'Blue',
  'Red',
  'Graphite',
  'Gold',
  'Green',
];

function hashToIndex(input: string, modulo: number): number {
  let hash = 0;
  for (const char of input) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % modulo;
}

async function ensureWarehouse(prisma: PrismaClient): Promise<string> {
  const existing = await prisma.warehouse.findFirst({
    where: { code: 'MAIN' },
    select: { id: true },
  });
  if (existing) return existing.id;

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
    select: { id: true },
  });
  return warehouse.id;
}

async function ensureColorValues(
  prisma: PrismaClient,
): Promise<Map<string, string>> {
  const attribute = await prisma.attribute.upsert({
    where: { slug: 'color' },
    update: { name: 'Color' },
    create: { name: 'Color', slug: 'color' },
    include: { values: true },
  });

  const valuesByName = new Map(attribute.values.map((v) => [v.value, v.id]));
  for (const value of COLOR_VALUES) {
    if (valuesByName.has(value)) continue;
    const created = await prisma.attributeValue.create({
      data: {
        attributeId: attribute.id,
        value,
        slug: slugify(value),
      },
      select: { id: true },
    });
    valuesByName.set(value, created.id);
  }
  return valuesByName;
}

async function ensureCategory(
  prisma: PrismaClient,
  categoriesRaw: RawCategory[],
  categoryName: string,
): Promise<string | null> {
  const source = categoriesRaw.find(
    (category) => category.name === categoryName,
  );
  const slug = source?.slug ?? slugify(categoryName);

  const category = await prisma.category.upsert({
    where: { slug },
    update: { name: categoryName, isActive: true },
    create: {
      name: categoryName,
      slug,
      isActive: true,
      sortOrder: categoriesRaw.findIndex((category) => category.slug === slug),
    },
    select: { id: true },
  });
  return category.id;
}

async function ensureBrand(
  prisma: PrismaClient,
  brandName: string,
): Promise<string> {
  const brand = await prisma.brand.upsert({
    where: { slug: slugify(brandName) },
    update: { name: brandName, isActive: true },
    create: { name: brandName, slug: slugify(brandName), isActive: true },
    select: { id: true },
  });
  return brand.id;
}

async function replaceProductDetailRows(
  prisma: PrismaClient,
  productId: string,
  product: RawPresentationProduct,
): Promise<void> {
  await prisma.productSpecification.deleteMany({ where: { productId } });
  await prisma.productImage.deleteMany({ where: { productId } });
  await prisma.productTagAssignment.deleteMany({ where: { productId } });

  await prisma.productSpecification.createMany({
    data: Object.entries(product.specs).map(([key, value], sortOrder) => ({
      productId,
      key,
      value,
      sortOrder,
    })),
  });

  await prisma.productImage.createMany({
    data: product.images.map((url, sortOrder) => ({
      productId,
      url,
      altText: product.name,
      sortOrder,
      isPrimary: sortOrder === 0,
    })),
  });

  for (const tagName of product.tags) {
    const tag = await prisma.tag.upsert({
      where: { slug: slugify(tagName) },
      update: { name: tagName },
      create: { name: tagName, slug: slugify(tagName) },
      select: { id: true },
    });
    await prisma.productTagAssignment.create({
      data: { productId, tagId: tag.id },
    });
  }
}

export async function seedPresentationProducts(
  prisma: PrismaClient,
): Promise<void> {
  const categoriesRaw = JSON.parse(
    readFileSync(join(__dirname, 'seed-data', 'categories.json'), 'utf-8'),
  ) as RawCategory[];
  const productsRaw = JSON.parse(
    readFileSync(
      join(__dirname, 'seed-data', 'presentation-products.json'),
      'utf-8',
    ),
  ) as RawPresentationProduct[];

  const warehouseId = await ensureWarehouse(prisma);
  const colorValueIdByName = await ensureColorValues(prisma);

  let upserted = 0;
  let skipped = 0;

  for (const product of productsRaw) {
    const categoryId = await ensureCategory(
      prisma,
      categoriesRaw,
      product.category,
    );
    if (!categoryId) {
      console.warn(
        `Skipping presentation product "${product.name}" — unrecognized category "${product.category}".`,
      );
      skipped += 1;
      continue;
    }

    const brandId = await ensureBrand(prisma, product.brand);
    const slug = `${slugify(product.name)}-${product.id}`;
    const sku = `SKU-${product.id.toUpperCase()}`;
    const color = COLOR_VALUES[hashToIndex(product.id, COLOR_VALUES.length)];
    const colorValueId = colorValueIdByName.get(color)!;

    const existing = await prisma.product.findUnique({
      where: { slug },
      include: { variants: { where: { sku }, take: 1 } },
    });

    const savedProduct = existing
      ? await prisma.product.update({
          where: { id: existing.id },
          data: {
            name: product.name,
            description: product.description,
            categoryId,
            brandId,
            status: ProductStatus.ACTIVE,
            isFeatured: product.featured ?? false,
            deletedAt: null,
          },
          select: { id: true },
        })
      : await prisma.product.create({
          data: {
            name: product.name,
            slug,
            description: product.description,
            categoryId,
            brandId,
            status: ProductStatus.ACTIVE,
            isFeatured: product.featured ?? false,
          },
          select: { id: true },
        });

    await replaceProductDetailRows(prisma, savedProduct.id, product);

    const variant = await prisma.productVariant.upsert({
      where: { sku },
      update: {
        productId: savedProduct.id,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        currency: 'INR',
        isDefault: true,
        isActive: true,
        deletedAt: null,
      },
      create: {
        productId: savedProduct.id,
        sku,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        currency: 'INR',
        isDefault: true,
        isActive: true,
      },
      select: { id: true },
    });

    await prisma.variantAttributeValue.deleteMany({
      where: { variantId: variant.id },
    });
    await prisma.variantAttributeValue.create({
      data: { variantId: variant.id, attributeValueId: colorValueId },
    });

    await prisma.inventory.upsert({
      where: {
        variantId_warehouseId: {
          variantId: variant.id,
          warehouseId,
        },
      },
      update: { quantityOnHand: product.stock, reorderPoint: 10 },
      create: {
        variantId: variant.id,
        warehouseId,
        quantityOnHand: product.stock,
        reorderPoint: 10,
      },
    });

    upserted += 1;
  }

  console.log(
    `Presentation catalog upserted: ${upserted} products (${skipped} skipped).`,
  );
}
