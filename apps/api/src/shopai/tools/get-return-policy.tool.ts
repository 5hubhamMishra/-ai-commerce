import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import type { ShopAITool, ShopAIToolResult } from './shopai-tool.interface';

@Injectable()
export class GetReturnPolicyTool implements ShopAITool {
  readonly name = 'get_return_policy';
  readonly description =
    "Get the real, configured return window in days. Optionally pass a categorySlug to check for a category-specific override. This is the only data this system has about returns — do not add invented details like restocking fees, condition requirements, or refund timelines that aren't returned here.";
  readonly inputSchema = {
    type: 'object',
    properties: {
      categorySlug: {
        type: 'string',
        description:
          'Optional category slug to check for an overridden return window.',
      },
    },
    required: [],
    additionalProperties: false,
  };

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(input: Record<string, unknown>): Promise<ShopAIToolResult> {
    const defaultWindowDays = this.config.get<number>(
      'returns.defaultWindowDays',
    );
    const categorySlug =
      typeof input.categorySlug === 'string' ? input.categorySlug : undefined;

    if (!categorySlug) {
      return {
        content: `The standard return window is ${defaultWindowDays} days from delivery.`,
        isError: false,
      };
    }

    const category = await this.prisma.category.findFirst({
      where: { slug: categorySlug, deletedAt: null },
      select: { name: true, returnWindowDays: true },
    });
    if (!category) {
      return {
        content: `Unknown category "${categorySlug}". The standard return window is ${defaultWindowDays} days from delivery.`,
        isError: false,
      };
    }
    const effective = category.returnWindowDays ?? defaultWindowDays;
    return {
      content:
        category.returnWindowDays != null
          ? `The return window for ${category.name} is ${effective} days from delivery (this category has its own override of the standard ${defaultWindowDays}-day window).`
          : `${category.name} uses the standard ${effective}-day return window from delivery.`,
      isError: false,
    };
  }
}
