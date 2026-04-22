import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Delete,
  Query,
  Req,
} from '@nestjs/common';
import { InteractionsService } from './interactions.service';
import { CreateInteractionDto } from './dto/create-interaction.dto';

@Controller('interactions')
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Post()
  create(@Body() dto: CreateInteractionDto, @Req() req: any) {
    return this.interactionsService.create(dto, req.user);
  }

  @Get()
  findAll(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('processId') processId?: string
  ) {
    // If startDate and endDate are provided, return interactions within date range
    // Otherwise return all interactions
    return this.interactionsService.findAll(
      startDate,
      endDate,
      processId ? parseInt(processId) : undefined,
      req.user.userId
    );
  }

  @Get('export')
  exportData(@Req() req: any) {
    return this.interactionsService.exportData(req.user.userId);
  }

  @Post('import')
  importData(@Body() data: { interactions: any[]; mode: 'overwrite' | 'append' }, @Req() req: any) {
    return this.interactionsService.importData(data.interactions, data.mode, req.user.userId);
  }

  @Get('process/:processId')
  findByProcess(@Param('processId', ParseIntPipe) processId: number, @Req() req: any) {
    return this.interactionsService.findByProcess(processId, req.user.userId);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req: any) {
    return this.interactionsService.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.interactionsService.remove(id, req.user.userId);
  }
}
