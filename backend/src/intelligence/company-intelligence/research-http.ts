import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import { ResearchError, ResearchFailure } from './research-error';

export const MAX_RESPONSE_BYTES = 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 20000;

export function apiKey(config: ConfigService, name: string): string {
  const key = config.get<string>(name)?.trim();
  if (!key) {
    throw new ResearchError(
      'PROVIDER_NOT_CONFIGURED',
      `${name} is not configured`,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
  return key;
}

export async function readLimitedBody(response: Response): Promise<string> {
  if (!response.body) throw new Error('Missing response body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('Response size limit exceeded');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function postResearchJson(
  endpoint: string,
  key: string,
  body: object,
  failure: ResearchFailure,
  parentSignal: AbortSignal,
): Promise<unknown> {
  const signal = AbortSignal.any([
    parentSignal,
    AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  ]);
  try {
    signal.throwIfAborted();
    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ResearchError(
        failure,
        `External request failed (HTTP ${response.status})`,
      );
    }
    return JSON.parse(await readLimitedBody(response)) as unknown;
  } catch (error) {
    if (signal.aborted)
      throw new ResearchError(
        'TIMEOUT',
        'External research request timed out',
        HttpStatus.GATEWAY_TIMEOUT,
        error,
      );
    if (error instanceof ResearchError) throw error;
    throw new ResearchError(
      failure,
      'External research request failed or returned invalid data',
      HttpStatus.BAD_GATEWAY,
      error,
    );
  }
}
