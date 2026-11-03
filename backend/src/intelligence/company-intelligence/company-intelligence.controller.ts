import { IntelligenceOwnerGuard } from '../guards/intelligence-owner.guard';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,

  UseGuards,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiGatewayTimeoutResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { toOpenApiSchema } from '../common/zod-openapi';
import { CompanyIntelligenceService } from './company-intelligence.service';
import { companyResearchRequestSchema } from './company-research-request.schema';
import {
  companyResearchReportSchema,
  quickCompanyReportSchema,
  deepCompanyReportSchema,
  toCompanyResearchReport,
  toQuickCompanyReport,
  toDeepCompanyReport,
} from './company-report.presentation';
import { UNIFIED_RESEARCH_MODE } from './research-mode';

const researchRequestDocumentation = {
  schema: toOpenApiSchema(companyResearchRequestSchema, 'input'),
  examples: {
    withRole: {
      summary: 'Company and relevant role',
      value: {
        companyName: 'Varonis',
        role: 'Backend Developer',
        provider: 'openai',
      },
    },
    companyOnly: {
      summary: 'Company without role intent',
      value: { companyName: 'Varonis', provider: 'openai' },
    },
  },
};

@ApiTags('company')
@ApiBadRequestResponse({ description: 'Invalid request body' })
@ApiBadGatewayResponse({
  description:
    'Provider, structured output, or evidence validation failure; includes a safe code',
})
@ApiGatewayTimeoutResponse({
  description: 'Research deadline or external request timeout',
})
@ApiServiceUnavailableResponse({
  description:
    'Required provider credentials are missing or candidate profile configuration is invalid',
})
@ApiInternalServerErrorResponse({ description: 'Report persistence failed' })
@UseGuards(IntelligenceOwnerGuard)
@Controller('intelligence/company')
export class CompanyIntelligenceController {
  constructor(private readonly service: CompanyIntelligenceService) {}

  @Post('research')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Research a company (single company research mode)',
    description:
      'The one company research flow: checks the PostgreSQL cache first, then researches deeply (general research, bounded follow-up searches on discovered anchors and public social/event sources, office investigation) and returns a concise presentation with richer secondary details. Consumes external provider quota on a cache miss. forceRefresh bypasses both caches.',
  })
  @ApiBody(researchRequestDocumentation)
  @ApiOkResponse({
    schema: toOpenApiSchema(companyResearchReportSchema),
    description:
      'Concise Hebrew company briefing plus public signals, an evidence-based assessment and collapsible details',
  })
  async research(@Body() body: unknown) {
    const request = companyResearchRequestSchema.safeParse(body);
    if (!request.success)
      throw new BadRequestException(request.error.flatten());
    return toCompanyResearchReport(
      await this.service.research(request.data, UNIFIED_RESEARCH_MODE),
    );
  }

  @Post('research/quick')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Deprecated: compact projection of the single company research',
    deprecated: true,
    description:
      'Runs the same single company research as POST /api/company/research and returns the previous compact QUICK response shape. Consumes external provider quota on a cache miss.',
  })
  @ApiBody(researchRequestDocumentation)
  @ApiOkResponse({
    schema: toOpenApiSchema(quickCompanyReportSchema),
    description:
      'Compact Hebrew company briefing; at most 3 roles and 3 flags per list',
  })
  async quick(@Body() body: unknown) {
    const request = companyResearchRequestSchema.safeParse(body);
    if (!request.success)
      throw new BadRequestException(request.error.flatten());
    return toQuickCompanyReport(
      await this.service.research(request.data, UNIFIED_RESEARCH_MODE),
    );
  }

  @Post('research/deep')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Deprecated: full projection of the single company research',
    deprecated: true,
    description:
      'Runs the same single company research as POST /api/company/research and returns the previous full DEEP response shape. Consumes external provider quota on a cache miss.',
  })
  @ApiBody(researchRequestDocumentation)
  @ApiOkResponse({
    schema: toOpenApiSchema(deepCompanyReportSchema),
    description: 'Persisted report with source-backed role list',
  })
  async deep(@Body() body: unknown) {
    const request = companyResearchRequestSchema.safeParse(body);
    if (!request.success)
      throw new BadRequestException(request.error.flatten());
    return toDeepCompanyReport(
      await this.service.research(request.data, UNIFIED_RESEARCH_MODE),
    );
  }
}
