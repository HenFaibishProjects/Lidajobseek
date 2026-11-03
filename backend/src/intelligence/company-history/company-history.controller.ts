import { IntelligenceOwnerGuard } from '../guards/intelligence-owner.guard';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,

  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiInternalServerErrorResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { toOpenApiSchema } from '../common/zod-openapi';
import {
  companyHistoryDetailSchema,
  companyHistoryItemSchema,
  companyHistoryLookupQuerySchema,
  companyHistoryLookupSchema,
  manualQuickUpdateSchema,
} from './company-history.schema';
import { CompanyHistoryService } from './company-history.service';

@ApiTags('company history')
@ApiInternalServerErrorResponse({ description: 'History database failure' })
@UseGuards(IntelligenceOwnerGuard)
@Controller('intelligence/company/history')
export class CompanyHistoryController {
  constructor(private readonly service: CompanyHistoryService) {}

  @Get()
  @ApiOperation({
    summary: 'Saved companies, one per company, most recently researched first',
    description:
      'Reads PostgreSQL only; no external research provider is called.',
  })
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(companyHistoryItemSchema)) })
  list() {
    return this.service.listHistory();
  }

  @Get('lookup')
  @ApiOperation({
    summary: 'Check whether a company already has saved research',
    description:
      'Matches the normalized company name used by research persistence. Reads PostgreSQL only.',
  })
  @ApiOkResponse({ schema: toOpenApiSchema(companyHistoryLookupSchema) })
  @ApiBadRequestResponse({ description: 'Missing or invalid companyName' })
  lookup(@Query() query: unknown) {
    const request = companyHistoryLookupQuerySchema.safeParse(query);
    if (!request.success)
      throw new BadRequestException(request.error.flatten());
    return this.service.lookup(request.data.companyName);
  }

  @Get(':companyId')
  @ApiOperation({
    summary: 'Latest saved QUICK presentation for a company',
    description:
      'Uses the same QUICK presentation as live research. Reads PostgreSQL only.',
  })
  @ApiOkResponse({ schema: toOpenApiSchema(companyHistoryDetailSchema) })
  @ApiNotFoundResponse({ description: 'COMPANY_NOT_FOUND' })
  detail(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.service.getDetail(companyId);
  }

  @Patch(':companyId')
  @ApiOperation({
    summary: 'Manually correct the saved QUICK information',
    description:
      "Updates the latest saved report and invalidates the company's research cache in one transaction. Does not change researchedAt.",
  })
  @ApiBody({ schema: toOpenApiSchema(manualQuickUpdateSchema, 'input') })
  @ApiOkResponse({ schema: toOpenApiSchema(companyHistoryDetailSchema) })
  @ApiBadRequestResponse({ description: 'Invalid manual update' })
  @ApiNotFoundResponse({ description: 'COMPANY_NOT_FOUND' })
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() body: unknown,
  ) {
    const request = manualQuickUpdateSchema.safeParse(body);
    if (!request.success)
      throw new BadRequestException(request.error.flatten());
    return this.service.updateManually(companyId, request.data);
  }

  @Delete(':companyId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a company and all of its saved research',
    description:
      'Removes the company, its reports, its research cache and its job match cache in one transaction.',
  })
  @ApiNoContentResponse({ description: 'Company deleted' })
  @ApiNotFoundResponse({ description: 'COMPANY_NOT_FOUND' })
  async remove(
    @Param('companyId', ParseUUIDPipe) companyId: string,
  ): Promise<void> {
    await this.service.deleteCompany(companyId);
  }
}
