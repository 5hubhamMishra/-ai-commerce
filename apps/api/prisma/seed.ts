/**
 * Local-dev-only seed: creates a SUPER_ADMIN account so the admin surface can be reached
 * immediately after a fresh `docker compose up` + `prisma migrate deploy`. Never runs in
 * production (guarded by NODE_ENV) and never used as a source of real customer data.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the dev seed against a production environment.');
  }

  const email = 'admin@veloura.dev';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Seed admin already exists: ${email}`);
    return;
  }

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

  console.log(`Seed admin created: ${email} / ChangeMe123! — change this password before deploying anywhere shared.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
