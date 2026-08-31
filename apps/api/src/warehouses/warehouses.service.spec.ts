import { Prisma } from '@prisma/client';
import { WarehousesService } from './warehouses.service';

describe('WarehousesService', () => {
  it('maps a concurrent warehouse code race to the duplicate conflict', async () => {
    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const prisma = {
      warehouse: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
    } as unknown as ConstructorParameters<typeof WarehousesService>[0];
    const service = new WarehousesService(
      prisma,
      {} as ConstructorParameters<typeof WarehousesService>[1],
    );

    await expect(
      service.create({ name: 'Main', code: 'main' }, 'actor1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'WAREHOUSE_CODE_TAKEN' }),
    });
    expect(create).toHaveBeenCalled();
  });
});
