import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import {
  EntityManager,
  EntityRepository,
  QueryOrder,
} from '@mikro-orm/postgresql';
import { MailCoverage } from './mail-coverage.entity';
import { UpsertMailCoverageDto } from './dto/upsert-mail-coverage.dto';
import { User } from '../users/user.entity';

interface NormalizedMailCoverage {
  companyName: string;
  note: string | null;
  receivedCvEmail: boolean;
  receivedCvDate: Date | null;
  rejectedEmail: boolean;
  rejectedDate: Date | null;
}

@Injectable()
export class MailCoverageService {
  constructor(
    @InjectRepository(MailCoverage)
    private readonly mailCoverageRepository: EntityRepository<MailCoverage>,
    private readonly em: EntityManager,
  ) {}

  async create(
    dto: UpsertMailCoverageDto,
    userId: number,
  ): Promise<MailCoverage> {
    const data = this.normalizeAndValidate(dto);
    await this.ensureCompanyIsUnique(data.companyName, userId);

    const entry = this.mailCoverageRepository.create({
      ...data,
      user: this.em.getReference(User, userId),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await this.em.persistAndFlush(entry);
    return entry;
  }

  async findAll(userId: number): Promise<MailCoverage[]> {
    return this.mailCoverageRepository.find(
      { user: userId },
      { orderBy: { companyName: QueryOrder.ASC } },
    );
  }

  async update(
    id: number,
    dto: UpsertMailCoverageDto,
    userId: number,
  ): Promise<MailCoverage> {
    const entry = await this.findOne(id, userId);
    const data = this.normalizeAndValidate(dto);
    await this.ensureCompanyIsUnique(data.companyName, userId, id);

    this.em.assign(entry, data);
    await this.em.flush();
    return entry;
  }

  async remove(id: number, userId: number): Promise<void> {
    const entry = await this.findOne(id, userId);
    await this.em.removeAndFlush(entry);
  }

  private async findOne(id: number, userId: number): Promise<MailCoverage> {
    const entry = await this.mailCoverageRepository.findOne({
      id,
      user: userId,
    });
    if (!entry) {
      throw new NotFoundException(`Mail coverage entry #${id} not found`);
    }
    return entry;
  }

  private normalizeAndValidate(
    dto: UpsertMailCoverageDto,
  ): NormalizedMailCoverage {
    const companyName = dto.companyName?.trim();
    if (!companyName) {
      throw new BadRequestException('Company name is required');
    }
    if (companyName.length > 255) {
      throw new BadRequestException('Company name is too long');
    }

    const note = dto.note?.trim() || null;
    if (note && note.length > 2000) {
      throw new BadRequestException('Note is too long');
    }

    const receivedCvEmail = dto.receivedCvEmail === true;
    const rejectedEmail = dto.rejectedEmail === true;
    const receivedCvDate = receivedCvEmail
      ? this.parseDate(dto.receivedCvDate, 'CV received date')
      : null;
    const rejectedDate = rejectedEmail
      ? this.parseDate(dto.rejectedDate, 'Rejection date')
      : null;

    if (receivedCvDate && rejectedDate && rejectedDate < receivedCvDate) {
      throw new BadRequestException(
        'Rejection date cannot be earlier than the CV received date',
      );
    }

    return {
      companyName,
      note,
      receivedCvEmail,
      receivedCvDate,
      rejectedEmail,
      rejectedDate,
    };
  }

  private parseDate(value: string | null | undefined, label: string): Date {
    if (!value) {
      throw new BadRequestException(`${label} is required`);
    }

    const dateValue = value.slice(0, 10);
    const date = new Date(`${dateValue}T12:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dateValue) ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== dateValue
    ) {
      throw new BadRequestException(`${label} is invalid`);
    }
    return date;
  }

  private async ensureCompanyIsUnique(
    companyName: string,
    userId: number,
    excludedId?: number,
  ): Promise<void> {
    const existing = await this.mailCoverageRepository.findOne({
      companyName: { $ilike: companyName },
      user: userId,
      ...(excludedId ? { id: { $ne: excludedId } } : {}),
    });

    if (existing) {
      throw new BadRequestException(
        `Mail coverage for ${companyName} already exists`,
      );
    }
  }
}
