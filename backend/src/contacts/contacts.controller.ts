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
    return this.contactsService.create(data, req.user.userId);
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
