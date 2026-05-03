import { Test, TestingModule } from '@nestjs/testing';
import { AiAssistantService } from './ai-assistant.service';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { Process } from '../processes/process.entity';
import { Interaction } from '../interactions/interaction.entity';
import { ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

describe('AiAssistantService', () => {
  let service: AiAssistantService;
  let configService: ConfigService;
  let processRepository: any;
  let interactionRepository: any;

  const mockProcess = {
    id: 1,
    companyName: 'Test Corp',
    roleTitle: 'Developer',
    currentStage: 'Initial',
    interactions: { getItems: () => [], length: 0 },
    reviews: { getItems: () => [], length: 0 },
    contacts: { getItems: () => [], length: 0 },
    initialInviteDate: new Date(),
    workMode: 'Remote'
  };

  beforeEach(async () => {
    const mockRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiAssistantService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'DEEPSEEK_API_KEY') return 'test-key';
              if (key === 'DEEPSEEK_API_URL') return 'https://api.test.com';
              return null;
            }),
          },
        },
        {
          provide: getRepositoryToken(Process),
          useValue: mockRepo,
        },
        {
          provide: getRepositoryToken(Interaction),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<AiAssistantService>(AiAssistantService);
    configService = module.get<ConfigService>(ConfigService);
    processRepository = module.get(getRepositoryToken(Process));
    interactionRepository = module.get(getRepositoryToken(Interaction));

    // Mock global fetch
    global.fetch = jest.fn() as any;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('summarizeProcess', () => {
    it('should throw ForbiddenException for non-premium users', async () => {
      await expect(
        service.summarizeProcess({ processId: 1 }, 123, 'free')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if process does not exist', async () => {
      processRepository.findOne.mockResolvedValue(null);
      await expect(
        service.summarizeProcess({ processId: 1 }, 123, 'premium')
      ).rejects.toThrow(NotFoundException);
    });

    it('should return a parsed response on success', async () => {
      processRepository.findOne.mockResolvedValue(mockProcess);
      
      const mockAiResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              summary: 'Looks good',
              risks: ['None'],
              recommendedNextSteps: ['Wait'],
              followUpSuggestion: 'None',
              confidence: 'high'
            })
          }
        }]
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockAiResponse,
      });

      const result = await service.summarizeProcess({ processId: 1 }, 123, 'premium');
      
      expect(result.summary).toBe('Looks good');
      expect(result.confidence).toBe('high');
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should handle AI provider errors', async () => {
      processRepository.findOne.mockResolvedValue(mockProcess);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Error',
      });

      await expect(
        service.summarizeProcess({ processId: 1 }, 123, 'premium')
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should use fallback if AI returns malformed JSON', async () => {
      processRepository.findOne.mockResolvedValue(mockProcess);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'NOT_JSON' } }] }),
      });

      const result = await service.summarizeProcess({ processId: 1 }, 123, 'premium');
      expect(result.summary).toContain('Unable to generate');
      expect(result.confidence).toBe('low');
    });

    it('should use fallback if AI returns empty array for risks/steps', async () => {
      processRepository.findOne.mockResolvedValue(mockProcess);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ 
          choices: [{ message: { content: JSON.stringify({ summary: 'ok' }) } }] 
        }),
      });

      const result = await service.summarizeProcess({ processId: 1 }, 123, 'premium');
      expect(result.risks).toEqual([]);
      expect(result.recommendedNextSteps).toEqual([]);
    });
  });

  describe('careerChat', () => {
    it('should return related processes in chat response', async () => {
      processRepository.find.mockResolvedValue([mockProcess]);
      
      const mockAiResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              answer: 'Here is your info',
              suggestedActions: ['Do something'],
              relatedProcesses: [{ processId: 1, company: 'Test Corp', role: 'Developer' }],
              confidence: 'medium'
            })
          }
        }]
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockAiResponse,
      });

      const result = await service.careerChat({ message: 'How am I doing?' }, 123, 'premium');
      
      expect(result.answer).toBe('Here is your info');
      expect(result.relatedProcesses[0].company).toBe('Test Corp');
    });
  });
});
