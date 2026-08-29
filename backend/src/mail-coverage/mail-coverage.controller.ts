import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { MailCoverageService } from './mail-coverage.service';
import { UpsertMailCoverageDto } from './dto/upsert-mail-coverage.dto';
import { BulkImportMailCoverageDto } from './dto/bulk-import-mail-coverage.dto';

@Controller('mail-coverage')
export class MailCoverageController {
  constructor(private readonly mailCoverageService: MailCoverageService) {}

  @Post()
  create(@Body() dto: UpsertMailCoverageDto, @Req() req: any) {
    return this.mailCoverageService.create(dto, req.user.userId);
  }

  @Post('import')
  importMany(@Body() dto: BulkImportMailCoverageDto, @Req() req: any) {
    return this.mailCoverageService.importMany(dto.entries, req.user.userId);
  }

  @Get()
  findAll(@Req() req: any) {
    return this.mailCoverageService.findAll(req.user.userId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertMailCoverageDto,
    @Req() req: any,
  ) {
    return this.mailCoverageService.update(id, dto, req.user.userId);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.mailCoverageService.remove(id, req.user.userId);
  }
}
