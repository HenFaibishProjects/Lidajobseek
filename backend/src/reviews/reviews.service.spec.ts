import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsService } from './reviews.service';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { SelfReview } from './self-review.entity';
import { Process } from '../processes/process.entity';
import { EntityManager, EntityRepository, QueryOrder } from '@mikro-orm/postgresql';
import { NotFoundException } from '@nestjs/common';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let repo: EntityRepository<SelfReview>;
  let em: EntityManager;

  const mockRepo = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockEm = {
    findOne: jest.fn(),
    persistAndFlush: jest.fn(),
    flush: jest.fn(),
    removeAndFlush: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getRepositoryToken(SelfReview), useValue: mockRepo },
        { provide: EntityManager, useValue: mockEm },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
    repo = module.get<EntityRepository<SelfReview>>(getRepositoryToken(SelfReview));
    em = module.get<EntityManager>(EntityManager);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a review if process exists and belongs to user', async () => {
      const dto = { processId: 1, content: 'Great' };
      mockEm.findOne.mockResolvedValue({ id: 1 });
      mockRepo.create.mockReturnValue({ ...dto, id: 10 });

      const result = await service.create(dto as any, 123);

      expect(em.findOne).toHaveBeenCalledWith(Process, { id: 1, user: 123 });
      expect(em.persistAndFlush).toHaveBeenCalled();
      expect(result.id).toBe(10);
    });

    it('should throw NotFoundException if process doesn exist for user', async () => {
      mockEm.findOne.mockResolvedValue(null);
      await expect(service.create({ processId: 1 } as any, 123)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByProcess', () => {
    it('should return reviews ordered by createdAt DESC', async () => {
      mockRepo.find.mockResolvedValue([]);
      await service.findByProcess(1, 123);
      expect(repo.find).toHaveBeenCalledWith(
        { process: { id: 1, user: 123 } },
        { orderBy: { createdAt: QueryOrder.DESC } }
      );
    });
  });

  describe('update', () => {
    it('should update review and flush changes', async () => {
      const review = { id: 1, whatWentWell: 'Old' };
      mockRepo.findOne.mockResolvedValue(review);

      await service.update(1, { whatWentWell: 'New' }, 123);

      expect(review.whatWentWell).toBe('New');
      expect(em.flush).toHaveBeenCalled();
    });

    it('should throw NotFoundException if review not found for user', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.update(1, {}, 123)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove and flush if found', async () => {
      const review = { id: 1 };
      mockRepo.findOne.mockResolvedValue(review);

      await service.remove(1, 123);

      expect(em.removeAndFlush).toHaveBeenCalledWith(review);
    });
  });
});
