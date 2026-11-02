import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { apiKey, postResearchJson } from './research-http';
import { ResearchError } from './research-error';
import { isAllowedResearchUrl } from './research-url';

const responseSchema = z.object({ results: z.array(z.unknown()).max(20) });
const resultSchema = z.object({
  title: z.string().max(1000),
  url: z.string().max(2048),
  content: z.string().max(100000).nullish(),
});
export interface ResearchSource {
  title: string;
  url: string;
  content: string;
  pageContent?: string;
  resolvedUrl?: string;
  readStatus?: 'not-read' | 'read' | 'failed';
  readFailure?: string;
}

@Injectable()
export class TavilyService {
  constructor(private readonly config: ConfigService) {}

  async searchWeb(
    query: string,
    signal: AbortSignal,
  ): Promise<ResearchSource[]> {
    const response = responseSchema.safeParse(
      await postResearchJson(
        'https://api.tavily.com/search',
        apiKey(this.config, 'TAVILY_API_KEY'),
        {
          query,
          search_depth: 'basic',
          max_results: 5,
          include_answer: false,
          include_raw_content: false,
        },
        'TAVILY_FAILURE',
        signal,
      ),
    );
    if (!response.success)
      throw new ResearchError(
        'TAVILY_FAILURE',
        'Tavily returned an invalid response',
      );
    const sources: ResearchSource[] = [];
    for (const candidate of response.data.results.slice(0, 5)) {
      const result = resultSchema.safeParse(candidate);
      if (!result.success || !isAllowedResearchUrl(result.data.url)) continue;
      sources.push({
        title: result.data.title.trim() || result.data.url,
        url: result.data.url,
        content: (result.data.content ?? '').slice(0, 3000),
      });
    }
    return sources;
  }
}
