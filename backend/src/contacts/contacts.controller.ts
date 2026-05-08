import {
  Controller,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Get,
  Query,
  Req,
} from '@nestjs/common';
import { ContactsService } from './contacts.service';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  create(@Body() data: any, @Req() req: any) {
    // Normalise: frontend may send `processId`, entity expects `process`
    const normalized = { ...data };
    if (normalized.processId !== undefined && normalized.process === undefined) {
      normalized.process = normalized.processId;
      delete normalized.processId;
    }
    return this.contactsService.create(normalized, req.user.userId);
  }

  @Get()
  findAll(@Query('processId') processId: string, @Req() req: any) {
    return this.contactsService.findAllByProcess(+processId, req.user.userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any, @Req() req: any) {
    return this.contactsService.update(+id, data, req.user.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.contactsService.remove(+id, req.user.userId);
  }
}
