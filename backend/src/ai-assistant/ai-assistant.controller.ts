import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AiAssistantService } from './ai-assistant.service';
import { ProcessSummaryDto } from './dto/process-summary.dto';
import { InteractionSummaryDto } from './dto/interaction-summary.dto';
import { CareerChatDto } from './dto/career-chat.dto';

@Controller('api/ai-assistant')
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Post('process-summary')
  @HttpCode(HttpStatus.OK)
  async processSummary(@Body() body: ProcessSummaryDto, @Req() req: any) {
    if (!body.processId || isNaN(Number(body.processId))) {
      throw new BadRequestException('processId is required and must be a number.');
    }

    const user = req.user;
    const dto: ProcessSummaryDto = {
      processId: Number(body.processId),
      userQuestion: body.userQuestion?.trim() || undefined,
    };

    return this.aiAssistantService.summarizeProcess(
      dto,
      user.id,
      user.pricingPlan ?? 'free',
    );
  }

  @Post('interaction-summary')
  @HttpCode(HttpStatus.OK)
  async interactionSummary(
    @Body() body: InteractionSummaryDto,
    @Req() req: any,
  ) {
    if (!body.interactionId || isNaN(Number(body.interactionId))) {
      throw new BadRequestException(
        'interactionId is required and must be a number.',
      );
    }

    const user = req.user;
    const dto: InteractionSummaryDto = {
      interactionId: Number(body.interactionId),
      userQuestion: body.userQuestion?.trim() || undefined,
    };

    return this.aiAssistantService.summarizeInteraction(
      dto,
      user.id,
      user.pricingPlan ?? 'free',
    );
  }

  @Post('career-chat')
  @HttpCode(HttpStatus.OK)
  async careerChat(@Body() body: CareerChatDto, @Req() req: any) {
    if (!body.message?.trim()) {
      throw new BadRequestException('message is required.');
    }

    const user = req.user;
    const dto: CareerChatDto = { message: body.message.trim() };

    return this.aiAssistantService.careerChat(
      dto,
      user.id,
      user.pricingPlan ?? 'free',
    );
  }
}
