import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { RecruitmentAgenciesService } from './recruitment-agencies.service';

@Controller('agencies')
export class RecruitmentAgenciesController {
  constructor(private readonly service: RecruitmentAgenciesService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.service.findAll(req.user.userId);
  }

  @Post()
  create(@Body() body: any, @Req() req: any) {
    return this.service.create(body, req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.findOne(id, req.user.userId);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Req() req: any) {
    return this.service.update(id, body, req.user.userId);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(id, req.user.userId);
  }
}
