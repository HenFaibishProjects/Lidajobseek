import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { User } from './user.entity';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';

describe('UsersService', () => {
  let service: UsersService;
  let repo: EntityRepository<User>;
  let em: EntityManager;

  const mockRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
  };

  const mockEm = {
    persistAndFlush: jest.fn(),
    flush: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
        { provide: EntityManager, useValue: mockEm },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repo = module.get<EntityRepository<User>>(getRepositoryToken(User));
    em = module.get<EntityManager>(EntityManager);

    jest.clearAllMocks();
  });

  describe('findOne', () => {
    it('should return a user if found by email', async () => {
      const user = { id: 1, email: 't@t.com' };
      mockRepo.findOne.mockResolvedValue(user);
      const result = await service.findOne('t@t.com');
      expect(result).toBe(user);
      expect(repo.findOne).toHaveBeenCalledWith({ email: 't@t.com' });
    });

    it('should return null if user not found by email', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.findOne('none@t.com');
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return a user if found by id', async () => {
      const user = { id: 1 };
      mockRepo.findOne.mockResolvedValue(user);
      const result = await service.findById(1);
      expect(result).toBe(user);
      expect(repo.findOne).toHaveBeenCalledWith({ id: 1 });
    });
  });

  describe('create', () => {
    it('should create and persist a new user with onboarding flag set to false', async () => {
      const data = { email: 'new@t.com', password: 'hash' };
      const expectedUser = { ...data, hasSeenOnboarding: false };
      mockRepo.create.mockReturnValue(expectedUser);

      const result = await service.create(data);

      expect(repo.create).toHaveBeenCalledWith({ ...data, hasSeenOnboarding: false });
      expect(em.persistAndFlush).toHaveBeenCalledWith(expectedUser);
      expect(result).toBe(expectedUser);
    });
  });

  describe('updatePreferences', () => {
    it('should update user preferences if user exists', async () => {
      const user = { id: 1, themePreference: 'light' };
      mockRepo.findOne.mockResolvedValue(user);

      const result = await service.updatePreferences(1, { themePreference: 'dark' });
      expect(user.themePreference).toBe('dark');
      expect(em.flush).toHaveBeenCalled();
      expect(result).toBe(user);
    });

    it('should update avatar style preference', async () => {
      const user = { id: 1, avatarStylePreference: 'avataaars' } as any;
      mockRepo.findOne.mockResolvedValue(user);

      await service.updatePreferences(1, { avatarStylePreference: 'bottts' });

      expect(user.avatarStylePreference).toBe('bottts');
      expect(em.flush).toHaveBeenCalled();
    });

    it('should update hasSeenOnboarding preference', async () => {
      const user = { id: 1, hasSeenOnboarding: false } as any;
      mockRepo.findOne.mockResolvedValue(user);

      await service.updatePreferences(1, { hasSeenOnboarding: true });

      expect(user.hasSeenOnboarding).toBe(true);
      expect(em.flush).toHaveBeenCalled();
    });

    it('should return null if user not found for preference update', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.updatePreferences(999, { themePreference: 'dark' });
      expect(result).toBeNull();
      expect(em.flush).not.toHaveBeenCalled();
    });
  });
});
