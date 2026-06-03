import { Controller, Post, Patch, Delete, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { AgencyContactsService } from './agency-contacts.service';

@Controller('agency-contacts')
export class AgencyContactsController {
  constructor(private readonly service: AgencyContactsService) {}

  @Post()
  create(@Body() body: any, @Req() req: any) {
    return this.service.create(body, req.user.userId);
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
