/**
 * One-off backfill: the catalog was originally seeded with every product pointing at a single
 * flat SVG illustration per category (see seed-catalog.ts history). prisma/seed-data/products.json
 * now carries real per-product photo URLs instead, but seed-catalog.ts only runs on an empty
 * table — this script updates the already-seeded ProductImage rows in place to match, without
 * touching any other data (carts, orders, wishlists keyed off the existing product/variant ids).
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { slugify } from '../src/common/utils/slugify';

type RawProduct = { id: string; name: string; images: string[] };

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const productsRaw = JSON.parse(
      readFileSync(join(__dirname, 'seed-data', 'products.json'), 'utf-8'),
    ) as RawProduct[];

    let updated = 0;
    let missing = 0;
    for (const p of productsRaw) {
      const slug = `${slugify(p.name)}-${p.id}`;
      const product = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
      if (!product) {
        missing += 1;
        continue;
      }
      const result = await prisma.productImage.updateMany({
        where: { productId: product.id, isPrimary: true },
        data: { url: p.images[0] },
      });
      if (result.count > 0) updated += 1;
    }

    console.log(`Backfilled ${updated} product images (${missing} products not found in DB).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
