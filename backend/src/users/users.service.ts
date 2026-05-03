import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager } from '@mikro-orm/postgresql';
import { User } from './user.entity';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: EntityRepository<User>,
        private readonly em: EntityManager,
    ) { }

    async findOne(email: string): Promise<User | null> {
        return this.userRepository.findOne({ email });
    }

    async findById(id: number): Promise<User | null> {
        return this.userRepository.findOne({ id });
    }

  async create(data: { email: string; password: string; name?: string }): Promise<User> {
    const user = this.userRepository.create({ ...data, hasSeenOnboarding: false } as any);
    await this.em.persistAndFlush(user);
    return user;
  }

  async updatePreferences(
    id: number,
    data: Partial<Pick<User, 'themePreference' | 'countryPreference' | 'dateFormatPreference' | 'timeFormatPreference' | 'avatarStylePreference' | 'hasSeenOnboarding'>>,
  ): Promise<User | null> {
    const user = await this.userRepository.findOne({ id });
    if (!user) {
      return null;
    }

    // Explicitly map allowed preference fields to ensure strict mass assignment protection
    if (data.themePreference !== undefined) user.themePreference = data.themePreference;
    if (data.countryPreference !== undefined) user.countryPreference = data.countryPreference || '';
    if (data.dateFormatPreference !== undefined) user.dateFormatPreference = data.dateFormatPreference;
    if (data.timeFormatPreference !== undefined) user.timeFormatPreference = data.timeFormatPreference;
    if (data.avatarStylePreference !== undefined) user.avatarStylePreference = data.avatarStylePreference;
    if (data.hasSeenOnboarding !== undefined) user.hasSeenOnboarding = data.hasSeenOnboarding;

    await this.em.flush();
    return user;
  }
}
