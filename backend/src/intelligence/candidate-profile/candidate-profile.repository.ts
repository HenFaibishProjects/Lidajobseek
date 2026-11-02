import { InjectDataSource } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CandidateProfileEntity } from './candidate-profile.entity';

@Injectable()
export class CandidateProfileRepository {
  constructor(@InjectDataSource('intelligence') private readonly dataSource: DataSource) {}

  async findProfileJson(profileId: string): Promise<unknown> {
    const row = await this.dataSource
      .getRepository(CandidateProfileEntity)
      .findOne({
        select: { id: true, profile: true },
        where: { id: profileId },
      });
    return row ? row.profile : null;
  }
}
