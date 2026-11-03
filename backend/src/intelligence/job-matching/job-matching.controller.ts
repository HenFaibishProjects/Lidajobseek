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
import {
  jobMatchRequestSchema,
  jobMatchResultSchema,
} from './job-match.schema';
import { JobMatchingService } from './job-matching.service';

@ApiTags('jobs')
@UseGuards(IntelligenceOwnerGuard)
@Controller('intelligence/jobs')
export class JobMatchingController {
  constructor(private readonly service: JobMatchingService) {}

  @Post('match')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Scan company jobs and match them to the stored candidate profile',
    description:
      "Loads candidate_profiles id 'default', discovers the company's current job postings with Tavily, reads promising postings with Firecrawl and assesses them in one structured LLM call. Match scores are rubric-based estimates, not probabilities. Results are cached for 7 days per company and profile fingerprint; forceRefresh bypasses the cache. Consumes external provider quota on a cache miss.",
  })
  @ApiBody({
    schema: toOpenApiSchema(jobMatchRequestSchema, 'input'),
    examples: {
      company: {
        summary: 'Company jobs for the stored profile',
        value: { companyName: 'Varonis', provider: 'openai' },
      },
    },
  })
  @ApiOkResponse({
    schema: toOpenApiSchema(jobMatchResultSchema),
    description:
      'Relevant jobs sorted by matchScore descending; an empty list is a valid result',
  })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  @ApiBadGatewayResponse({
    description: 'Search, page reading or LLM failure; includes a safe code',
  })
  @ApiGatewayTimeoutResponse({ description: 'Job matching deadline exceeded' })
  @ApiServiceUnavailableResponse({
    description:
      'Candidate profile missing, invalid or not configured (CANDIDATE_PROFILE_INVALID), or provider credentials missing',
  })
  @ApiInternalServerErrorResponse({
    description: 'Candidate profile or job match cache database failure',
  })
  async match(@Body() body: unknown) {
    const request = jobMatchRequestSchema.safeParse(body);
    if (!request.success)
      throw new BadRequestException(request.error.flatten());
    return this.service.match(request.data);
  }
}
