/**
 * The SUPER_ADMIN account below uses a hardcoded, publicly-known password
 * (`ChangeMe123!`) — never created in production (guarded by NODE_ENV), regardless of
 * SEED_CATALOG_IN_PRODUCTION. `seedCatalog` itself has no secrets or credentials — it's
 * just product/category reference data — so it's separately allowed to run in production
 * when explicitly opted into, for standing up a demo environment's catalog.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { seedCatalog } from './seed-catalog';
import { seedPresentationProducts } from './seed-presentation-products';

const prisma = new PrismaClient();

async function main() {
  const inProduction = process.env.NODE_ENV === 'production';

  if (inProduction && process.env.SEED_CATALOG_IN_PRODUCTION !== 'true') {
    throw new Error(
      'Refusing to run the dev seed against a production environment. Set ' +
        'SEED_CATALOG_IN_PRODUCTION=true to allow catalog-only seeding (the demo admin ' +
        'account is still never created in production).',
    );
  }

  if (inProduction) {
    console.log(
      'SEED_CATALOG_IN_PRODUCTION=true — seeding catalog only, skipping demo admin account.',
    );
  } else {
    const email = 'admin@veloura.dev';
    const existingAdmin = await prisma.user.findUnique({ where: { email } });
    if (existingAdmin) {
      console.log(`Seed admin already exists: ${email}`);
    } else {
      const passwordHash = await bcrypt.hash('ChangeMe123!', 12);
      await prisma.user.create({
        data: {
          email,
          passwordHash,
          name: 'Veloura Admin',
          roles: { create: [{ role: Role.SUPER_ADMIN }] },
          profile: { create: {} },
        },
      });
      console.log(
        `Seed admin created: ${email} / ChangeMe123! — change this password before deploying anywhere shared.`,
      );
    }
  }

  await seedCatalog(prisma);
  await seedPresentationProducts(prisma);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
