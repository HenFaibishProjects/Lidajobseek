import { Test, TestingModule } from '@nestjs/testing';
import { InteractionsService } from './interactions.service';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { Interaction } from './interaction.entity';
import { Process } from '../processes/process.entity';
import { Contact } from '../contacts/contact.entity';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { MailService } from '../mail/mail.service';
import { WhatsAppReminderService } from './whatsapp-reminder.service';
import { NotFoundException } from '@nestjs/common';

describe('InteractionsService', () => {
  let service: InteractionsService;
  let interactionRepo: EntityRepository<Interaction>;
  let contactRepo: EntityRepository<Contact>;
  let processRepo: EntityRepository<Process>;
  let em: EntityManager;
  let mailService: MailService;

  const mockInteractionRepo = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockContactRepo = {
    create: jest.fn(),
    findOne: jest.fn(),
  };

  const mockProcessRepo = {
    findOne: jest.fn(),
  };

  const mockEm = {
    persistAndFlush: jest.fn(),
    persist: jest.fn(),
    flush: jest.fn(),
    removeAndFlush: jest.fn(),
    fork: jest.fn().mockReturnThis(),
    getRepository: jest.fn().mockReturnThis(),
    clear: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((entity, data) => data),
    assign: jest.fn().mockImplementation((entity, data) => Object.assign(entity, data)),
  };

  const mockMailService = {
    isConfigured: jest.fn(),
    sendMail: jest.fn(),
  };

  const mockWhatsAppReminderService = {
    isConfigured: jest.fn(),
    buildReminderWhatsAppText: jest.fn(),
    sendInterviewReminder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InteractionsService,
        { provide: getRepositoryToken(Interaction), useValue: mockInteractionRepo },
        { provide: getRepositoryToken(Contact), useValue: mockContactRepo },
        { provide: getRepositoryToken(Process), useValue: mockProcessRepo },
        { provide: EntityManager, useValue: mockEm },
        { provide: MailService, useValue: mockMailService },
        { provide: WhatsAppReminderService, useValue: mockWhatsAppReminderService },
      ],
    }).compile();

    service = module.get<InteractionsService>(InteractionsService);
    interactionRepo = module.get<EntityRepository<Interaction>>(getRepositoryToken(Interaction));
    contactRepo = module.get<EntityRepository<Contact>>(getRepositoryToken(Contact));
    processRepo = module.get<EntityRepository<Process>>(getRepositoryToken(Process));
    em = module.get<EntityManager>(EntityManager);
    mailService = module.get<MailService>(MailService);

    jest.clearAllMocks();
    // Stop the timer to prevent background processes during tests
    service.onModuleDestroy();
  });

  describe('create', () => {
    const user = { userId: 1, pricingPlan: 'free' };
    const dto = {
      processId: 10,
      date: '2026-05-01T10:00:00Z',
      interviewType: 'phone',
      participants: [{ name: 'Recruiter A' }],
    };

    it('should create interaction and auto-add new contacts', async () => {
      const mockProcess = { id: 10, user: 1 };
      mockProcessRepo.findOne.mockResolvedValue(mockProcess);
      mockInteractionRepo.create.mockImplementation(data => data);
      mockContactRepo.findOne.mockResolvedValue(null); // Contact doesn't exist

      await service.create(dto as any, user);

      expect(mockInteractionRepo.create).toHaveBeenCalled();
      expect(mockContactRepo.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Recruiter A' }));
      expect(em.persist).toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
    });

    it('should throw NotFoundException if process not found', async () => {
      mockProcessRepo.findOne.mockResolvedValue(null);
      await expect(service.create(dto as any, user)).rejects.toThrow(NotFoundException);
    });

    it('should not add contact if it already exists for the process', async () => {
      const mockProcess = { id: 10, user: 1 };
      mockProcessRepo.findOne.mockResolvedValue(mockProcess);
      mockInteractionRepo.create.mockImplementation(data => data);
      mockContactRepo.findOne.mockResolvedValue({ id: 1 }); // Already exists

      await service.create(dto as any, user);

      expect(mockContactRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should filter by date range if provided', async () => {
      const interactions = [{ id: 1, process: { companyName: 'A' } }];
      mockInteractionRepo.find.mockResolvedValue(interactions);

      const result = await service.findAll({
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        userId: 1
      });

      expect(mockInteractionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          date: { $gte: expect.any(Date), $lte: expect.any(Date) },
        }),
        expect.anything()
      );
      expect(result[0].process.companyName).toBe('A');
    });

    it('should filter only by startDate if endDate is missing', async () => {
      await service.findAll({
        startDate: '2026-01-01',
        userId: 1
      });
      expect(mockInteractionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ date: { $gte: expect.any(Date) } }),
        expect.anything()
      );
    });
  });

  describe('update', () => {
    it('should reset reminder flags if date is updated', async () => {
      const existing = {
        id: 1,
        reminder: { enabled: true, emailSentAt: 'today' },
        process: { user: 1 }
      };
      mockInteractionRepo.findOne.mockResolvedValue(existing);

      const result = await service.update(1, { date: '2026-06-01' }, { userId: 1 });

      expect(existing.reminder.emailSentAt).toBeUndefined();
      expect(em.flush).toHaveBeenCalled();
    });

    it('should throw NotFoundException if interaction doesn belong to user', async () => {
      mockInteractionRepo.findOne.mockResolvedValue(null);
      await expect(service.update(1, {}, { userId: 1 })).rejects.toThrow(NotFoundException);
    });
  });

  describe('importData', () => {
    it('should overwrite existing data if mode is overwrite', async () => {
      mockInteractionRepo.find.mockResolvedValue([{ id: 1 }]);
      
      await service.importData([], 'overwrite', 1);

      expect(em.removeAndFlush).toHaveBeenCalled();
    });

    it('should only import interactions where process exists for user', async () => {
      const interactions = [
        { processId: 1, date: '2026-01-01' },
        { processId: 2, date: '2026-01-02' }
      ];
      mockProcessRepo.findOne.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);

      const result = await service.importData(interactions, 'append', 1);

      expect(result.count).toBe(1);
      expect(em.persist).toHaveBeenCalledTimes(1);
    });
  });
});
