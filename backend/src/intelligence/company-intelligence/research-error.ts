import { APICallError } from 'ai';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';

export type ResearchFailure =
  | 'CANDIDATE_PROFILE_INVALID'
  | 'LLM_FAILURE'
  | 'TAVILY_FAILURE'
  | 'FIRECRAWL_FAILURE'
  | 'TIMEOUT'
  | 'STRUCTURED_OUTPUT_INVALID'
  | 'EVIDENCE_INVALID'
  | 'DATABASE_FAILURE'
  | 'PROVIDER_NOT_CONFIGURED';

export class ResearchError extends HttpException {
  constructor(
    readonly code: ResearchFailure,
    message: string,
    status = HttpStatus.BAD_GATEWAY,
    cause?: unknown,
  ) {
    super({ code, message }, status, { cause });
  }
}

const MAX_PROVIDER_MESSAGE_CHARACTERS = 1000;
const MAX_PROVIDER_ERROR_BODY_CHARACTERS = 16000;

function safeProviderMessage(error: APICallError, message: string): string {
  if (message.length > MAX_PROVIDER_ERROR_BODY_CHARACTERS)
    return 'Provider error message exceeded diagnostic size limit';
  let sanitized = message;
  const secrets = Object.entries(process.env)
    .filter(
      ([name, value]) =>
        /key|token|password|secret|authorization/i.test(name) && value,
    )
    .map(([, value]) => value!);
  let inspectedValues = 0;
  function collectRequestValues(value: unknown, depth = 0): void {
    if (++inspectedValues > 2000 || depth > 12) return;
    if (typeof value === 'string' && value.length >= 4) secrets.push(value);
    else if (Array.isArray(value)) {
      for (const item of value) collectRequestValues(item, depth + 1);
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value))
        collectRequestValues(item, depth + 1);
    }
  }
  collectRequestValues(error.requestBodyValues);
  for (const secret of secrets.sort(
    (first, second) => second.length - first.length,
  ))
    sanitized = sanitized.split(secret).join('[REDACTED]');
  return sanitized
    .replace(/\bsk-[a-zA-Z0-9_-]+/g, '[REDACTED]')
    .replace(
      /(?:authorization|api[-_ ]?key|access[-_ ]?token)\s*[:=]\s*[^,;\n]+/gi,
      '[REDACTED]',
    )
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g, (quoted) =>
      /^(?:additionalProperties|required|properties|items|type|anyOf|oneOf|allOf|\$ref|response_format|json_schema|strict|schema|temperature|max_tokens|max_output_tokens|text\.format)$/.test(
        quoted.slice(1, -1),
      )
        ? quoted
        : '[REDACTED]',
    )
    .replace(/\s+/g, ' ')
    .slice(0, MAX_PROVIDER_MESSAGE_CHARACTERS);
}

function providerErrorDetails(error: APICallError) {
  let providerError: Record<string, unknown> = {};
  if (
    error.responseBody &&
    error.responseBody.length <= MAX_PROVIDER_ERROR_BODY_CHARACTERS
  ) {
    try {
      const body: unknown = JSON.parse(error.responseBody);
      if (
        body &&
        typeof body === 'object' &&
        'error' in body &&
        body.error &&
        typeof body.error === 'object'
      )
        providerError = body.error as Record<string, unknown>;
    } catch {
      providerError = {};
    }
  }
  const safeIdentifier = (value: unknown) =>
    typeof value === 'string' && /^[a-zA-Z0-9_.[\]-]{1,160}$/.test(value)
      ? safeProviderMessage(error, value)
      : undefined;
  return {
    providerErrorCode: safeIdentifier(providerError.code),
    providerErrorType: safeIdentifier(providerError.type),
    providerErrorParameter: safeIdentifier(providerError.param),
    providerErrorMessage: safeProviderMessage(
      error,
      typeof providerError.message === 'string'
        ? providerError.message
        : error.message,
    ),
  };
}

export function logResearchFailure(
  logger: Logger,
  error: ResearchError,
  context: {
    provider: string;
    stage: string;
    mode?: string;
    searchCalls: number;
    scrapeCalls: number;
    discoveredSize: number;
    pagesSize: number;
  },
): void {
  const cause = error.cause;
  const causeName =
    cause instanceof Error
      ? cause.name.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 80)
      : undefined;
  const providerStatus =
    typeof cause === 'object' &&
    cause !== null &&
    'statusCode' in cause &&
    typeof cause.statusCode === 'number'
      ? cause.statusCode
      : undefined;
  logger.error({
    ...context,
    code: error.code,
    status: error.getStatus(),
    message: error.message,
    causeName,
    providerStatus,
    ...(APICallError.isInstance(cause) ? providerErrorDetails(cause) : {}),
  });
}
