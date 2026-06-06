import { Test, TestingModule } from '@nestjs/testing';
import { InteractionsController } from './interactions.controller';
import { InteractionsService } from './interactions.service';

describe('InteractionsController', () => {
  let controller: InteractionsController;
  let service: InteractionsService;

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    exportData: jest.fn(),
    importData: jest.fn(),
    findByProcess: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockReq = { user: { userId: 1, email: 't@t.com' } };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InteractionsController],
      providers: [{ provide: InteractionsService, useValue: mockService }],
    }).compile();

    controller = module.get<InteractionsController>(InteractionsController);
    service = module.get<InteractionsService>(InteractionsService);
    
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should call service.create with dto and user from request', async () => {
      const dto = { processId: 1, date: '2026-01-01' };
      await controller.create(dto as any, mockReq);
      expect(service.create).toHaveBeenCalledWith(dto, expect.objectContaining({ userId: 1 }));
    });
  });

  describe('findAll', () => {
    it('should parse processId query parameter to integer', async () => {
      await controller.findAll(mockReq, '2026-01-01', '2026-01-31', '50');
      expect(service.findAll).toHaveBeenCalledWith({
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        processId: 50,
        userId: 1,
      });
    });

    it('should handle missing processId', async () => {
      await controller.findAll(mockReq, '2026-01-01', '2026-01-31', undefined);
      expect(service.findAll).toHaveBeenCalledWith({
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        processId: undefined,
        userId: 1,
      });
    });
  });

  describe('importData', () => {
    it('should call service.importData with correct parameters', async () => {
      const data = { interactions: [], mode: 'append' as const };
      await controller.importData(data, mockReq);
      expect(service.importData).toHaveBeenCalledWith([], 'append', 1);
    });
  });
});
