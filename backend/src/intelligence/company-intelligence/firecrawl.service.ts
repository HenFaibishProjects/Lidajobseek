import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { apiKey, postResearchJson, REQUEST_TIMEOUT_MS } from './research-http';
import { ResearchError } from './research-error';
import { assertPublicResearchUrl } from './research-url';

export const MAX_PAGE_CHARACTERS = 20000;
const responseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      markdown: z.string().trim().nullish(),
      metadata: z
        .object({
          url: z.string().optional(),
          sourceURL: z.string().optional(),
          statusCode: z.number().optional(),
          error: z.string().nullish(),
        })
        .optional(),
    })
    .optional(),
});

@Injectable()
export class FirecrawlService {
  constructor(private readonly config: ConfigService) {}

  async readPage(
    url: string,
    discoveredUrls: ReadonlySet<string>,
    parentSignal: AbortSignal,
  ): Promise<{ content: string; resolvedUrl?: string }> {
    if (!discoveredUrls.has(url))
      throw new ResearchError(
        'EVIDENCE_INVALID',
        'Page was not discovered in this research run',
      );
    const signal = AbortSignal.any([
      parentSignal,
      AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ]);
    try {
      await assertPublicResearchUrl(url, signal);
      const response = responseSchema.safeParse(
        await postResearchJson(
          'https://api.firecrawl.dev/v2/scrape',
          apiKey(this.config, 'FIRECRAWL_API_KEY'),
          {
            url,
            formats: ['markdown'],
            onlyMainContent: true,
            timeout: 15000,
            maxAge: 0,
            skipTlsVerification: false,
          },
          'FIRECRAWL_FAILURE',
          signal,
        ),
      );
      if (!response.success)
        throw new ResearchError(
          'FIRECRAWL_FAILURE',
          'Firecrawl returned an invalid response',
        );
      const data = response.data.data;
      const metadata = data?.metadata;
      for (const reportedUrl of new Set([metadata?.url, metadata?.sourceURL])) {
        if (reportedUrl && reportedUrl !== url)
          await assertPublicResearchUrl(reportedUrl, signal);
      }
      if (
        !response.data.success ||
        !data?.markdown ||
        metadata?.error ||
        (metadata?.statusCode && metadata.statusCode >= 400)
      ) {
        throw new ResearchError(
          'FIRECRAWL_FAILURE',
          'Firecrawl could not read the source page',
        );
      }
      const resolvedUrl = metadata?.url ?? metadata?.sourceURL;
      return {
        content: data.markdown.slice(0, MAX_PAGE_CHARACTERS),
        ...(resolvedUrl && resolvedUrl !== url ? { resolvedUrl } : {}),
      };
    } catch (error) {
      if (error instanceof ResearchError && error.code === 'EVIDENCE_INVALID')
        throw error;
      if (signal.aborted)
        throw new ResearchError(
          'TIMEOUT',
          'Page reading timed out',
          HttpStatus.GATEWAY_TIMEOUT,
          error,
        );
      if (error instanceof ResearchError) throw error;
      throw new ResearchError(
        'FIRECRAWL_FAILURE',
        'Page address could not be verified',
        HttpStatus.BAD_GATEWAY,
        error,
      );
    }
  }
}
