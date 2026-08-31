import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { slugify } from '../common/utils/slugify';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateHelpArticleDto } from './dto/create-help-article.dto';
import type { UpdateHelpArticleDto } from './dto/update-help-article.dto';

@Injectable()
export class HelpCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listPublished(category?: string) {
    return this.prisma.helpArticle.findMany({
      where: { isPublished: true, ...(category ? { category } : {}) },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async getPublishedBySlug(slug: string) {
    const article = await this.prisma.helpArticle.findFirst({
      where: { slug, isPublished: true },
    });
    if (!article) {
      throw new NotFoundException({
        code: 'HELP_ARTICLE_NOT_FOUND',
        message: 'Help article not found.',
      });
    }
    return article;
  }

  async listAdmin() {
    return this.prisma.helpArticle.findMany({
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async create(dto: CreateHelpArticleDto, actorId: string) {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.title);
    await this.assertSlugAvailable(slug);

    let article: Awaited<ReturnType<typeof this.prisma.helpArticle.create>>;
    try {
      article = await this.prisma.helpArticle.create({
        data: {
          title: dto.title,
          slug,
          body: dto.body,
          category: dto.category,
          sortOrder: dto.sortOrder ?? 0,
          isPublished: dto.isPublished ?? true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'HELP_ARTICLE_SLUG_TAKEN',
          message: 'A help article with this slug already exists.',
        });
      }
      throw error;
    }
    await this.audit.record({
      actorId,
      action: 'HELP_ARTICLE_CREATED',
      entityType: 'help_article',
      entityId: article.id,
      metadata: { slug },
    });
    return article;
  }

  async update(id: string, dto: UpdateHelpArticleDto, actorId: string) {
    await this.assertExists(id);
    const slug = dto.slug ? slugify(dto.slug) : undefined;
    if (slug) await this.assertSlugAvailable(slug, id);

    let article: Awaited<ReturnType<typeof this.prisma.helpArticle.update>>;
    try {
      article = await this.prisma.helpArticle.update({
        where: { id },
        data: {
          title: dto.title,
          slug,
          body: dto.body,
          category: dto.category,
          sortOrder: dto.sortOrder,
          isPublished: dto.isPublished,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'HELP_ARTICLE_SLUG_TAKEN',
          message: 'A help article with this slug already exists.',
        });
      }
      throw error;
    }
    await this.audit.record({
      actorId,
      action: 'HELP_ARTICLE_UPDATED',
      entityType: 'help_article',
      entityId: id,
    });
    return article;
  }

  async remove(id: string, actorId: string): Promise<void> {
    await this.assertExists(id);
    await this.prisma.helpArticle.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: 'HELP_ARTICLE_DELETED',
      entityType: 'help_article',
      entityId: id,
    });
  }

  private async assertExists(id: string) {
    const article = await this.prisma.helpArticle.findUnique({ where: { id } });
    if (!article) {
      throw new NotFoundException({
        code: 'HELP_ARTICLE_NOT_FOUND',
        message: 'Help article not found.',
      });
    }
    return article;
  }

  private async assertSlugAvailable(slug: string, excludeId?: string) {
    const existing = await this.prisma.helpArticle.findUnique({
      where: { slug },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException({
        code: 'HELP_ARTICLE_SLUG_TAKEN',
        message: 'A help article with this slug already exists.',
      });
    }
  }
}
