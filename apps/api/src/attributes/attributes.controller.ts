import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AttributesService } from './attributes.service';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { CreateAttributeValueDto } from './dto/create-attribute-value.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';

const CATALOG_WRITE_ROLES = [
  Role.CONTENT_MANAGER,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];

/** Attribute definitions (e.g. Color, Storage) used to build variant filters/facets. */
@Controller('attributes')
export class AttributesController {
  constructor(private readonly attributesService: AttributesService) {}

  @Public()
  @Get()
  list() {
    return this.attributesService.list();
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateAttributeDto) {
    return this.attributesService.create(dto);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAttributeDto) {
    return this.attributesService.update(id, dto);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.attributesService.remove(id);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Post(':id/values')
  addValue(@Param('id') id: string, @Body() dto: CreateAttributeValueDto) {
    return this.attributesService.addValue(id, dto);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Delete(':id/values/:valueId')
  removeValue(@Param('id') id: string, @Param('valueId') valueId: string) {
    return this.attributesService.removeValue(id, valueId);
  }
}
