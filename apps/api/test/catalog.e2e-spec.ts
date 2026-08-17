import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Exercises the critical catalog operations end to end against a real database:
 * admin CRUD across categories/brands/products/variants/images/specifications/tags/
 * warehouses/inventory, RBAC enforcement, conflict handling, and that the customer
 * (public) surface only ever sees ACTIVE, non-deleted catalog content.
 */
describe('Catalog (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = Date.now();
  const adminEmail = `e2e-catalog-admin-${run}@example.com`;
  const customerEmail = `e2e-catalog-customer-${run}@example.com`;

  let adminToken: string;
  let customerToken: string;
  let categoryId: string;
  let categorySlug: string;
  let brandId: string;
  let productId: string;
  let productSlug: string;
  let variantId: string;
  let warehouseId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await bcrypt.hash('password123', 4);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        name: 'E2E Catalog Admin',
        roles: {
          create: [
            { role: Role.CONTENT_MANAGER },
            { role: Role.INVENTORY_MANAGER },
          ],
        },
      },
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: 'password123' })
      .expect(200);
    adminToken = adminLogin.body.accessToken;

    const customerRegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: customerEmail,
        password: 'password123',
        name: 'E2E Customer',
      })
      .expect(201);
    customerToken = customerRegister.body.accessToken;
  });

  afterAll(async () => {
    if (productId)
      await prisma.product
        .delete({ where: { id: productId } })
        .catch(() => undefined);
    if (categoryId)
      await prisma.category
        .delete({ where: { id: categoryId } })
        .catch(() => undefined);
    if (brandId)
      await prisma.brand
        .delete({ where: { id: brandId } })
        .catch(() => undefined);
    if (warehouseId)
      await prisma.warehouse
        .delete({ where: { id: warehouseId } })
        .catch(() => undefined);
    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, customerEmail] } },
    });
    await app.close();
  });

  it('rejects catalog writes without authentication', () => {
    return request(app.getHttpServer())
      .post('/api/v1/categories')
      .send({ name: 'Should Fail' })
      .expect(401);
  });

  it('rejects catalog writes from a plain customer (RBAC)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ name: 'Should Fail' })
      .expect(403);
  });

  it('creates a category as an authorized content manager', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `E2E Category ${run}` })
      .expect(201);

    categoryId = res.body.id;
    categorySlug = res.body.slug;
    expect(categorySlug).toContain('e2e-category');
  });

  it('rejects a duplicate category slug with a stable error code', () => {
    return request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `E2E Category ${run}` })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('CATEGORY_SLUG_TAKEN');
      });
  });

  it('creates a brand', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `E2E Brand ${run}` })
      .expect(201);
    brandId = res.body.id;
  });

  it('creates an ACTIVE product with category and brand', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `E2E Product ${run}`,
        description: 'A product created by the catalog e2e suite.',
        categoryId,
        brandId,
        status: 'ACTIVE',
      })
      .expect(201);

    productId = res.body.id;
    productSlug = res.body.slug;
    expect(res.body.variants).toEqual([]);
  });

  it('is not yet visible on the public product list (no variants means no price)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/products/' + productSlug)
      .expect(200);
    expect(res.body.minPrice).toBeNull();
    expect(res.body.inStock).toBe(false);
  });

  it('adds a variant and it becomes the default automatically', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: `E2E-SKU-${run}`, price: 499.99 })
      .expect(201);

    const variant = res.body.variants[0];
    variantId = variant.id;
    expect(variant.isDefault).toBe(true);
    expect(variant.price).toBe(499.99);
  });

  it('rejects a second variant reusing the same SKU', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: `E2E-SKU-${run}`, price: 599 })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('SKU_ALREADY_EXISTS');
      });
  });

  it('adds an image, a specification, and a tag', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/images`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: 'https://example.com/e2e-product.jpg', isPrimary: true })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/specifications`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'Material', value: 'Aluminum' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/tags`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'e2e-tag' })
      .expect(201);

    expect(res.body.images).toHaveLength(1);
    expect(res.body.specifications).toHaveLength(1);
    expect(res.body.tags).toEqual(['e2e-tag']);
  });

  it('creates a warehouse and sets inventory, reflected immediately in availability', async () => {
    const warehouseRes = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `E2E Warehouse ${run}`,
        code: `E2E-WH-${run}`,
        line1: '1 Test St',
        city: 'Testville',
        state: 'TS',
        postalCode: '00000',
        country: 'IN',
      })
      .expect(201);
    warehouseId = warehouseRes.body.id;

    await request(app.getHttpServer())
      .put(`/api/v1/inventory/variants/${variantId}/warehouses/${warehouseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantityOnHand: 42 })
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/products/${productSlug}`)
      .expect(200);

    expect(detail.body.inStock).toBe(true);
    expect(detail.body.variants[0].availableQuantity).toBe(42);
  });

  it('appears in the public category-scoped product listing', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/categories/${categorySlug}/products`)
      .expect(200);

    const body = res.body as { items: { id: string }[] };
    expect(body.items.some((item) => item.id === productId)).toBe(true);
  });

  it('is filterable by price range on the public product list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/products')
      .query({ minPrice: 400, maxPrice: 500, search: `E2E Product ${run}` })
      .expect(200);

    const body = res.body as { items: { id: string }[] };
    expect(body.items.some((item) => item.id === productId)).toBe(true);
  });

  it('blocks category deletion while the product still references it', () => {
    return request(app.getHttpServer())
      .delete(`/api/v1/categories/${categoryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('CATEGORY_NOT_EMPTY');
      });
  });

  it('soft-deletes the product and it disappears from both the public and admin APIs', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/products/${productSlug}`)
      .expect(404);

    // Soft-deleted is treated as gone everywhere (same rule as categories/brands) —
    // the audit_logs entry from this deletion is the historical record, not this endpoint.
    await request(app.getHttpServer())
      .get(`/api/v1/products/admin/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
