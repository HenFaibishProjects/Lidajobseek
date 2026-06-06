import { Controller, Get, Post, Body, Param, ParseIntPipe, Patch, Delete, Req } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  create(@Body() dto: CreateTemplateDto, @Req() req: any) {
    return this.templatesService.create(dto, req.user.userId);
  }

  @Get()
  findAll(@Req() req: any) {
    return this.templatesService.findAll(req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.templatesService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateTemplateDto>, @Req() req: any) {
    return this.templatesService.update(id, dto, req.user.userId);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.templatesService.remove(id, req.user.userId);
  }
}
