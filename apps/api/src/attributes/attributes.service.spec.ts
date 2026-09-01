import { Prisma } from '@prisma/client';
import { AttributesService } from './attributes.service';

describe('AttributesService', () => {
  it('maps a concurrent attribute deletion to not found', async () => {
    const update = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );
    const prisma = {
      attribute: {
        findUnique: jest.fn().mockResolvedValue({ id: 'a1', values: [] }),
        update,
      },
    } as unknown as ConstructorParameters<typeof AttributesService>[0];
    const service = new AttributesService(prisma);

    await expect(service.update('a1', { name: 'Color' })).rejects.toMatchObject(
      {
        response: expect.objectContaining({ code: 'ATTRIBUTE_NOT_FOUND' }),
      },
    );
    expect(update).toHaveBeenCalled();
  });

  it('maps a concurrent attribute value race to the duplicate conflict', async () => {
    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const prisma = {
      attribute: {
        findUnique: jest.fn().mockResolvedValue({ id: 'a1', values: [] }),
      },
      attributeValue: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
    } as unknown as ConstructorParameters<typeof AttributesService>[0];
    const service = new AttributesService(prisma);

    await expect(
      service.addValue('a1', { value: 'Red', slug: 'red' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ATTRIBUTE_VALUE_ALREADY_EXISTS',
      }),
    });
    expect(create).toHaveBeenCalled();
  });
});
