import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

import { EmailFilterDecision } from '../recruiter-agent.types';
import type {
  IncomingEmail,
  RecruiterEmailPrefilterResult,
} from '../recruiter-agent.types';

interface RecruiterEmailFilterConfig {
  blockedSenders: string[];
  blockedDomains: string[];
  rejectionPhrases: string[];
  advertisingSignals: string[];
  advertisingSignalThreshold: number;
}

const CONFIG_CANDIDATES = [
  path.join(
    process.cwd(),
    'src',
    'intelligence',
    'recruiter-agent',
    'config',
    'recruiter-email-filter.yml',
  ),
  path.join(
    process.cwd(),
    'backend',
    'src',
    'intelligence',
    'recruiter-agent',
    'config',
    'recruiter-email-filter.yml',
  ),
];

const CONFIG_PATH =
  CONFIG_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ??
  CONFIG_CANDIDATES[0];

let cachedConfig: RecruiterEmailFilterConfig | null = null;
let cachedModifiedTime = 0;

export function prefilterRecruiterEmail(
  email: IncomingEmail,
): RecruiterEmailPrefilterResult {
  const config = loadConfig();

  const senderEmail = extractEmailAddress(email.from);
  const senderDomain = extractDomain(senderEmail);

  /*
   * 1. Explicit sender block list
   */
  if (
    config.blockedSenders.some(
      sender => normalize(sender) === normalize(senderEmail),
    )
  ) {
    return blocked(
      EmailFilterDecision.BLOCKED_SENDER,
      `blocked sender: ${senderEmail}`,
    );
  }

  /*
   * 2. Explicit domain block list
   */
  if (
    config.blockedDomains.some(
      domain => normalize(domain) === normalize(senderDomain),
    )
  ) {
    return blocked(
      EmailFilterDecision.BLOCKED_DOMAIN,
      `blocked domain: ${senderDomain}`,
    );
  }

  /*
   * Work only with the newest part of the message when checking
   * semantic text rules.
   *
   * This avoids matching an old rejection that appears inside
   * a quoted email thread.
   */
  const currentMessage = stripQuotedHistory(email.body);

  const searchableText = normalize(
    `${email.subject}\n${currentMessage}`,
  );

  /*
   * 3. Hard rejection
   *
   * These are strong enough signals that we don't need an LLM call.
   */
  const rejectionPhrase = config.rejectionPhrases.find(phrase =>
    searchableText.includes(normalize(phrase)),
  );

  if (rejectionPhrase) {
    return blocked(
      EmailFilterDecision.REJECTION,
      `rejection detected: ${rejectionPhrase}`,
    );
  }

  /*
   * 4. Obvious advertising / bulk marketing
   *
   * A single "unsubscribe" is NOT enough.
   *
   * Recruiting systems often include unsubscribe links too.
   * We require several advertising signals before dropping it.
   */
  const advertisingMatches = config.advertisingSignals.filter(signal =>
    searchableText.includes(normalize(signal)),
  );

  if (
    advertisingMatches.length >=
    config.advertisingSignalThreshold
  ) {
    return blocked(
      EmailFilterDecision.ADVERTISEMENT,
      `advertising detected: ${advertisingMatches.join(', ')}`,
    );
  }

  /*
   * 5. Nothing gave us a strong reason to ignore the email.
   *
   * Let the LLM inspect it.
   */
  return {
    shouldAnalyze: true,
    decision: EmailFilterDecision.PASS,
    reasons: ['no deterministic ignore rule matched'],
  };
}

function loadConfig(): RecruiterEmailFilterConfig {
  const stats = fs.statSync(CONFIG_PATH);

  /*
   * Reload automatically when YAML changes.
   *
   * This means we can add blocked senders while the application
   * is running without changing TypeScript code.
   */
  if (
    cachedConfig &&
    cachedModifiedTime === stats.mtimeMs
  ) {
    return cachedConfig;
  }

  const file = fs.readFileSync(CONFIG_PATH, 'utf8');

  const config =
    YAML.parse(file) as Partial<RecruiterEmailFilterConfig>;

  cachedConfig = {
    blockedSenders: config.blockedSenders ?? [],
    blockedDomains: config.blockedDomains ?? [],
    rejectionPhrases: config.rejectionPhrases ?? [],
    advertisingSignals: config.advertisingSignals ?? [],
    advertisingSignalThreshold:
      config.advertisingSignalThreshold ?? 2,
  };

  cachedModifiedTime = stats.mtimeMs;

  return cachedConfig;
}

function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);

  if (match?.[1]) {
    return normalize(match[1]);
  }

  return normalize(from);
}

function extractDomain(email: string): string {
  const atIndex = email.lastIndexOf('@');

  if (atIndex === -1) {
    return '';
  }

  return email.slice(atIndex + 1);
}

function stripQuotedHistory(body: string): string {
  const lines = body.split(/\r?\n/);

  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (
      /^on .+wrote:$/i.test(trimmed) ||
      /^בתאריך .+ כתב/i.test(trimmed) ||
      /^-{2,}\s*forwarded message\s*-{2,}$/i.test(trimmed)
    ) {
      break;
    }

    if (trimmed.startsWith('>')) {
      continue;
    }

    result.push(line);
  }

  return result.join('\n');
}

function blocked(
  decision: EmailFilterDecision,
  reason: string,
): RecruiterEmailPrefilterResult {
  return {
    shouldAnalyze: false,
    decision,
    reasons: [reason],
  };
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[״“”]/g, '"')
    .replace(/[׳‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}