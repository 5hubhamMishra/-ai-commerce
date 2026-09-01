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

  it('rejects a stale article update', async () => {
    const updatedAt = new Date('2026-09-01T00:00:00.000Z');
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      helpArticle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'article-1',
          updatedAt,
        }),
        updateMany,
      },
    };
    const service = new HelpCenterService(prisma as never, {} as never);

    await expect(
      service.update('article-1', { title: 'New title' }, 'actor1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'HELP_ARTICLE_CHANGED' }),
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'article-1', updatedAt },
      data: {
        title: 'New title',
        slug: undefined,
        body: undefined,
        category: undefined,
        sortOrder: undefined,
        isPublished: undefined,
      },
    });
  });

  it('rejects a stale article deletion', async () => {
    const updatedAt = new Date('2026-09-01T00:00:00.000Z');
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      helpArticle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'article-1',
          updatedAt,
        }),
        deleteMany,
      },
    };
    const service = new HelpCenterService(prisma as never, {} as never);

    await expect(service.remove('article-1', 'actor1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'HELP_ARTICLE_CHANGED' }),
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 'article-1', updatedAt },
    });
  });
});
