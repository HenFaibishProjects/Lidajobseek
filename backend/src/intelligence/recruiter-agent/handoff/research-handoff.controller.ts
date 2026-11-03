import { IntelligenceOwnerGuard } from '../../guards/intelligence-owner.guard';
import { ResearchHandoffImportService } from './research-handoff-import.service';
import { MAX_CHATGPT_IMPORT_CHARACTERS } from './chatgpt-research-import.schema';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,

  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { ResearchHandoffService } from './research-handoff.service';
import { ResearchHandoffStatus } from './research-handoff.types';

const querySchema = z.object({
  status: z.enum(ResearchHandoffStatus).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

@UseGuards(IntelligenceOwnerGuard)
@Controller('intelligence/research-handoffs')
export class ResearchHandoffController {
  constructor(
    private readonly handoffs: ResearchHandoffService,
    private readonly imports: ResearchHandoffImportService,
  ) {}

  @Get()
  list(@Query() query: unknown) {
    const parsed = querySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException('Invalid handoff list query.');
    return this.handoffs.list(
      parsed.data.status,
      parsed.data.limit,
      parsed.data.offset,
    );
  }

  @Get('pending')
  pending(@Query() query: unknown) {
    const parsed = querySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException('Invalid handoff list query.');
    return this.handoffs.listPendingResearch(
      parsed.data.limit,
      parsed.data.offset,
    );
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.handoffs.detail(id);
  }

  @Post(':id/cancel')
  async cancel(@Param('id', ParseUUIDPipe) id: string) {
    await this.handoffs.cancelHandoff(id);
    return this.handoffs.detail(id);
  }

  @Post(':id/start')
  async start(@Param('id', ParseUUIDPipe) id: string) {
    await this.handoffs.startHandoff(id);
    return this.handoffs.detail(id);
  }

  @Post(':id/complete')
  async complete(@Param('id', ParseUUIDPipe) id: string) {
    await this.handoffs.completeHandoff(id);
    return this.handoffs.detail(id);
  }

  @Post(':id/import')
  importResearch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .strictObject({
        content: z.string().min(1).max(MAX_CHATGPT_IMPORT_CHARACTERS),
      })
      .safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        'Expected a bounded research content string.',
      );
    return this.imports.importResearch(id, parsed.data.content);
  }
}
