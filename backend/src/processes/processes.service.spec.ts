import { Test, TestingModule } from '@nestjs/testing';
import { ProcessesService } from './processes.service';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { Process } from './process.entity';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { NotFoundException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { MailCoverageService } from '../mail-coverage/mail-coverage.service';

describe('ProcessesService', () => {
  let service: ProcessesService;
  let repo: EntityRepository<Process>;
  let em: EntityManager;

  const mockRepo = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockEm = {
    getReference: jest.fn(),
    persistAndFlush: jest.fn(),
    persist: jest.fn(),
    flush: jest.fn(),
    removeAndFlush: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
  };

  const mockMailCoverageService = {
    syncRejectedProcess: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessesService,
        { provide: getRepositoryToken(Process), useValue: mockRepo },
        { provide: EntityManager, useValue: mockEm },
        { provide: MailCoverageService, useValue: mockMailCoverageService },
      ],
    }).compile();

    service = module.get<ProcessesService>(ProcessesService);
    repo = module.get<EntityRepository<Process>>(getRepositoryToken(Process));
    em = module.get<EntityManager>(EntityManager);

    jest.clearAllMocks();
  });

  describe('isClosedStage (private)', () => {
    it('should identify closed stages correctly', () => {
      // Accessing private method via bracket notation for testing
      expect((service as any).isClosedStage('Rejected')).toBe(false);
      expect((service as any).isClosedStage('Withdrawn')).toBe(false);
    });
  });

  describe('create', () => {
    it('should normalize scores and dates during creation', async () => {
      const dto = {
        companyName: 'Test',
        scoreTech: '', // Should become 0
        salaryExpectation: '', // Should become null
        initialInviteDate: '2026-04-01',
      };
      mockEm.getReference.mockReturnValue({});
      mockRepo.create.mockImplementation(data => ({
        ...data,
        interactions: { add: jest.fn() },
        contacts: { add: jest.fn() },
        reviews: { add: jest.fn() }
      }));

      await service.create(dto as any, 1);

      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        scoreTech: 0,
        salaryExpectation: null,
        initialInviteDate: expect.any(Date),
      }));
    });

    it('should call syncInitialInteraction if initialInviteDate is present', async () => {
      const dto = { companyName: 'Test', initialInviteDate: '2026-04-01' };
      mockEm.findOne.mockResolvedValue(null); // No existing interaction
      mockRepo.create.mockReturnValue({
        ...dto,
        initialInviteDate: new Date(dto.initialInviteDate),
        interactions: { add: jest.fn() },
        contacts: { add: jest.fn() },
        reviews: { add: jest.fn() }
      });

      await service.create(dto as any, 1);

      expect(mockEm.findOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        summary: { $like: 'Initial Interaction:%' }
      }));
      expect(mockEm.persist).toHaveBeenCalled(); // Should persist the new interaction
    });

    it('should update existing interaction if one already exists', async () => {
      const dto = { companyName: 'Test', initialInviteDate: '2026-04-01' };
      const existingInteraction = { id: 100, summary: 'Initial Interaction: Old' };
      mockEm.findOne.mockResolvedValue(existingInteraction);
      mockRepo.create.mockReturnValue({
        ...dto,
        initialInviteDate: new Date(dto.initialInviteDate),
        interactions: { add: jest.fn() },
        contacts: { add: jest.fn() },
        reviews: { add: jest.fn() }
      });

      await service.create(dto as any, 1);

      expect(mockEm.findOne).toHaveBeenCalled();
      expect(existingInteraction.summary).toContain('Initial Interaction:');
      expect(mockEm.persist).not.toHaveBeenCalled(); // Should NOT persist a new one, just update the existing
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should persist companyWebsite and companyLogoUrl when provided', async () => {
      const dto = {
        companyName: 'google',
        companyWebsite: 'google.com',
        companyLogoUrl: 'https://www.google.com/s2/favicons?domain=google.com&sz=128',
      };
      mockEm.getReference.mockReturnValue({});
      mockRepo.create.mockImplementation(data => ({
        ...data,
        interactions: { add: jest.fn() },
        contacts: { add: jest.fn() },
        reviews: { add: jest.fn() }
      }));

      await service.create(dto as any, 1);

      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        companyWebsite: 'google.com',
        companyLogoUrl: 'https://www.google.com/s2/favicons?domain=google.com&sz=128',
      }));
    });

    it('should create process without companyWebsite when not provided', async () => {
      const dto = { companyName: 'NoBrand Corp' };
      mockEm.getReference.mockReturnValue({});
      mockRepo.create.mockImplementation(data => ({
        ...data,
        interactions: { add: jest.fn() },
        contacts: { add: jest.fn() },
        reviews: { add: jest.fn() }
      }));

      await service.create(dto as any, 1);

      const callArg = mockRepo.create.mock.calls[0][0];
      expect(callArg.companyName).toBe('NoBrand Corp');
      expect(callArg.companyWebsite).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update companyWebsite and companyLogoUrl on an existing process', async () => {
      const existingProcess: any = {
        id: 1,
        companyName: 'Old Corp',
        companyWebsite: '',
        companyLogoUrl: '',
        interactions: { add: jest.fn() },
      };
      mockRepo.findOne.mockResolvedValue(existingProcess);

      const updateDto = {
        companyWebsite: 'google.com',
        companyLogoUrl: 'https://www.google.com/s2/favicons?domain=google.com&sz=128',
      };

      await service.update(1, updateDto, 1);

      expect(existingProcess.companyWebsite).toBe('google.com');
      expect(existingProcess.companyLogoUrl).toBe('https://www.google.com/s2/favicons?domain=google.com&sz=128');
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should NOT update companyWebsite if not provided in the dto', async () => {
      const existingProcess: any = {
        id: 1,
        companyName: 'Old Corp',
        companyWebsite: 'oldcorp.com',
        companyLogoUrl: 'https://old-logo.com',
      };
      mockRepo.findOne.mockResolvedValue(existingProcess);

      await service.update(1, { roleTitle: 'New Title' }, 1);

      expect(existingProcess.companyWebsite).toBe('oldcorp.com'); // unchanged
      expect(existingProcess.companyLogoUrl).toBe('https://old-logo.com'); // unchanged
    });

    it('should throw NotFoundException when updating a non-existent process', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.update(999, {}, 1)).rejects.toThrow(NotFoundException);
    });

    it('should not sync mail coverage for other process stages', async () => {
      const existingProcess: any = {
        id: 1,
        companyName: 'Acme',
        currentStage: 'Initial Call Scheduled',
      };
      mockRepo.findOne.mockResolvedValue(existingProcess);

      await service.update(1, { currentStage: 'Waiting for Interview Feedback' }, 1);

      expect(
        mockMailCoverageService.syncRejectedProcess,
      ).not.toHaveBeenCalled();
    });

    it('should persist jobDescriptionUrl when provided in create', async () => {
      const dto = {
        companyName: 'Test Corp',
        jobDescriptionUrl: 'https://careers.google.com/jobs/123',
      };
      mockEm.getReference.mockReturnValue({});
      mockRepo.create.mockImplementation(data => ({
        ...data,
        interactions: { add: jest.fn() },
        contacts: { add: jest.fn() },
        reviews: { add: jest.fn() }
      }));

      await service.create(dto as any, 1);

      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        jobDescriptionUrl: 'https://careers.google.com/jobs/123',
      }));
    });

    it('should update jobDescriptionUrl on an existing process', async () => {
      const existingProcess: any = {
        id: 1,
        companyName: 'Old Corp',
        jobDescriptionUrl: '',
        interactions: { add: jest.fn() },
      };
      mockRepo.findOne.mockResolvedValue(existingProcess);

      const updateDto = {
        jobDescriptionUrl: 'https://new-job-link.com',
      };

      await service.update(1, updateDto, 1);

      expect(existingProcess.jobDescriptionUrl).toBe('https://new-job-link.com');
      expect(mockEm.flush).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return processes with interaction count', async () => {
      const userId = 1;
      const mockProcesses = [
        { id: 1, currentStage: 'Waiting for Interview Feedback', interactions: [{}, {}], reviews: [] },
      ];
      mockRepo.find.mockResolvedValue(mockProcesses);

      await service.findAll(userId);

      expect(mockRepo.find).toHaveBeenCalled();
    });
  });


  describe('importData', () => {
    it('should deep clone relations and handle dates', async () => {
      const data = [{
        companyName: 'Imported',
        interactions: [{ date: '2026-05-01' }],
      }];
      mockEm.create.mockReturnValue({});
      mockRepo.create.mockReturnValue({ interactions: { add: jest.fn() }, contacts: { add: jest.fn() }, reviews: { add: jest.fn() } });

      const result = await service.importData(data, 'append', 1);

      expect(result.count).toBe(1);
      expect(mockEm.persist).toHaveBeenCalled();
    });

    it('should delete existing user data in overwrite mode', async () => {
      mockRepo.find.mockResolvedValue([{ id: 5 }]);
      await service.importData([], 'overwrite', 1);
      expect(mockEm.removeAndFlush).toHaveBeenCalled();
    });
  });
});
