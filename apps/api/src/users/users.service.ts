import { Injectable, NotFoundException } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type UserWithRoles = {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  deletedAt: Date | null;
  roles: { role: Role }[];
};

// Explicit allowlist, not `include: { roles: true }` on a bare query — a bare query
// returns every scalar column (passwordHash included) at runtime regardless of what a
// TypeScript return type claims, which would make leaking it just one missing
// `toPublic()` call away. `select` makes it structurally impossible to fetch, not just
// procedurally filtered after the fact.
const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  isActive: true,
  createdAt: true,
  deletedAt: true,
  roles: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserWithRoles> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }
    return user;
  }

  async updateName(id: string, name: string): Promise<UserWithRoles> {
    return this.prisma.user.update({
      where: { id },
      data: { name },
      select: USER_SELECT,
    });
  }

  async list(params: { page: number; pageSize: number }) {
    const { page, pageSize } = params;
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where: { deletedAt: null } }),
    ]);
    return { items, total, page, pageSize };
  }

  toPublic(user: UserWithRoles) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      createdAt: user.createdAt,
      roles: user.roles.map((r) => r.role),
    };
  }
}
