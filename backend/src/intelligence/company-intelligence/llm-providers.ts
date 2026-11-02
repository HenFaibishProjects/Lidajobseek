import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import type { LanguageModel } from 'ai';
import type { LlmProvider } from './company-research-request.schema';
import { apiKey, readLimitedBody } from './research-http';
import {
  DEFAULT_RECRUITER_DECISION_PROVIDER,
  DEFAULT_RECRUITER_DECISION_MODEL,
} from '../config/environment';

const boundedFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, { ...init, redirect: 'error' });
  const body = await readLimitedBody(response);
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};

@Injectable()
export class LlmProviders {
  constructor(private readonly config: ConfigService) {}

  recruiterDecisionModel(onRequest: () => Promise<void>): LanguageModel {
    return this.model(
      this.config.get<LlmProvider>('RECRUITER_DECISION_PROVIDER') ??
        DEFAULT_RECRUITER_DECISION_PROVIDER,
      this.config.get<string>('RECRUITER_DECISION_MODEL')?.trim() ||
        DEFAULT_RECRUITER_DECISION_MODEL,
      onRequest,
    );
  }

  recruiterModel(
    stage: 'CHEAP' | 'ANALYSIS',
    onRequest: () => Promise<void>,
  ): LanguageModel {
    const provider =
      this.config.get<LlmProvider>(`RECRUITER_${stage}_PROVIDER`) ?? 'openai';
    const modelKey = `RECRUITER_${stage}_MODEL`;
    const modelName = this.config.get<string>(modelKey)?.trim();
    if (!modelName) throw new Error(`${modelKey} is not configured`);
    return this.model(provider, modelName, onRequest);
  }

  model(
    provider: LlmProvider,
    modelName?: string,
    onRequest?: () => Promise<void>,
  ): LanguageModel {
    const requestFetch: typeof fetch = onRequest
      ? async (input, init) => {
          try {
            return await boundedFetch(input, init);
          } finally {
            // Record real HTTP attempts, including provider/network failures.
            await onRequest();
          }
        }
      : boundedFetch;
    if (provider === 'openai') {
      return createOpenAI({
        apiKey: apiKey(this.config, 'OPENAI_API_KEY'),
        fetch: requestFetch,
      }).responses(modelName ?? this.config.getOrThrow<string>('OPENAI_MODEL'));
    }
    return createDeepSeek({
      apiKey: apiKey(this.config, 'DEEPSEEK_API_KEY'),
      fetch: async (input, init) => {
        if (typeof init?.body !== 'string')
          throw new Error('Expected a JSON DeepSeek request body.');
        const body: unknown = JSON.parse(init.body);
        if (!body || typeof body !== 'object' || Array.isArray(body))
          throw new Error('Expected a JSON object for the DeepSeek request.');
        return requestFetch(input, {
          ...init,
          body: JSON.stringify({ ...body, thinking: { type: 'disabled' } }),
        });
      },
    }).chat(modelName ?? this.config.getOrThrow<string>('DEEPSEEK_MODEL'));
  }
}
