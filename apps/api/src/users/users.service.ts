import { Injectable, NotFoundException } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type UserWithRoles = {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  roles: { role: Role }[];
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserWithRoles> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: true },
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
      include: { roles: true },
    });
  }

  async list(params: { page: number; pageSize: number }) {
    const { page, pageSize } = params;
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        include: { roles: true },
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
