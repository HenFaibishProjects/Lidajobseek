import { InjectDataSource } from '@nestjs/typeorm';
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, MoreThan } from 'typeorm';
import type { CandidateProfile } from '../candidate-profile/candidate-profile';
import { normalizeLookup } from '../company-intelligence/research-cache';
import { JobMatchCacheEntity } from './job-match-cache.entity';
import { jobMatchContentSchema } from './job-match.schema';
import type { JobMatchContent } from './job-match.schema';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
export const JOB_MATCH_CACHE_TTL_MS = 7 * MILLISECONDS_PER_DAY;

export interface JobMatchCacheKey {
  companyKey: string;
  profileFingerprint: string;
}
export interface CachedJobMatch {
  content: JobMatchContent;
  refreshedAt: Date;
}

export function jobMatchCacheKey(
  companyName: string,
  profile: CandidateProfile,
): JobMatchCacheKey {
  return {
    companyKey: normalizeLookup(companyName),
    profileFingerprint: createHash('sha256')
      .update(JSON.stringify(profile))
      .digest('hex'),
  };
}

@Injectable()
export class JobMatchCacheRepository {
  private readonly logger = new Logger(JobMatchCacheRepository.name);

  constructor(@InjectDataSource('intelligence') private readonly dataSource: DataSource) {}

  async findFresh(
    key: JobMatchCacheKey,
    now: Date,
  ): Promise<CachedJobMatch | null> {
    const entry = await this.dataSource
      .getRepository(JobMatchCacheEntity)
      .findOne({
        where: {
          companyKey: key.companyKey,
          profileFingerprint: key.profileFingerprint,
          refreshedAt: MoreThan(
            new Date(now.getTime() - JOB_MATCH_CACHE_TTL_MS),
          ),
        },
      });
    if (!entry) return null;
    const content = jobMatchContentSchema.safeParse(entry.content);
    if (!content.success) {
      this.logger.warn({
        event: 'job-match-cache-invalid',
        companyKey: key.companyKey,
      });
      return null;
    }
    return { content: content.data, refreshedAt: entry.refreshedAt };
  }

  async save(
    key: JobMatchCacheKey,
    content: JobMatchContent,
    refreshedAt: Date,
  ): Promise<void> {
    await this.dataSource
      .getRepository(JobMatchCacheEntity)
      .upsert({ ...key, content, refreshedAt }, [
        'companyKey',
        'profileFingerprint',
      ]);
  }
}
