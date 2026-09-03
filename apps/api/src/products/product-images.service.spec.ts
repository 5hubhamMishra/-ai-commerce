import { Prisma } from '@prisma/client';
import { ProductImagesService } from './product-images.service';

describe('ProductImagesService', () => {
  it('maps a primary-image uniqueness race to a conflict', async () => {
    const prisma = {
      productImage: {
        updateMany: jest.fn(),
        create: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        ),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(prisma),
      ),
    };
    const service = new ProductImagesService(
      prisma as never,
      { getRowById: jest.fn().mockResolvedValue({ id: 'p1' }) } as never,
      { productChanged: jest.fn() } as never,
      { record: jest.fn() } as never,
    );

    await expect(
      service.create(
        'p1',
        { url: 'https://example.com/image.jpg', isPrimary: true },
        'actor1',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PRIMARY_IMAGE_CHANGED' }),
    });
  });
});
