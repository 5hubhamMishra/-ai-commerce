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

  it('rejects a stale warehouse update', async () => {
    const updatedAt = new Date('2026-09-01T00:00:00.000Z');
    const warehouseUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'warehouse-1',
          updatedAt,
        }),
        updateMany: warehouseUpdateMany,
      },
    };
    const service = new WarehousesService(prisma as never, {} as never);

    await expect(
      service.update('warehouse-1', { name: 'New name' }, 'actor1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'WAREHOUSE_CHANGED' }),
    });
    expect(warehouseUpdateMany).toHaveBeenCalledWith({
      where: { id: 'warehouse-1', updatedAt },
      data: { name: 'New name' },
    });
  });
});
