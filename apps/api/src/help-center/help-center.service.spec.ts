import { Prisma } from '@prisma/client';
import { HelpCenterService } from './help-center.service';

describe('HelpCenterService', () => {
  it('maps a concurrent article slug race to the duplicate conflict', async () => {
    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const prisma = {
      helpArticle: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
    } as unknown as ConstructorParameters<typeof HelpCenterService>[0];
    const service = new HelpCenterService(
      prisma,
      {} as ConstructorParameters<typeof HelpCenterService>[1],
    );

    await expect(
      service.create(
        {
          title: 'Shipping',
          slug: 'shipping',
          body: 'Details',
          category: 'Orders',
        },
        'actor1',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'HELP_ARTICLE_SLUG_TAKEN' }),
    });
    expect(create).toHaveBeenCalled();
  });
});
