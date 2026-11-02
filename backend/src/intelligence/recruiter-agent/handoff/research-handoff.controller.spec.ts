import { IntelligenceOwnerGuard } from '../../guards/intelligence-owner.guard';
import { ResearchHandoffImportService } from './research-handoff-import.service';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ResearchHandoffController } from './research-handoff.controller';
import { ResearchHandoffService } from './research-handoff.service';

const id = '11111111-1111-4111-8111-111111111111';
describe('Research handoff API', () => {
  let app: INestApplication;
  const service = {
    list: jest.fn().mockResolvedValue([]),
    listPendingResearch: jest
      .fn()
      .mockResolvedValue([
        { id, companyName: 'Acme', status: 'PENDING_CHATGPT' },
      ]),
    detail: jest
      .fn()
      .mockResolvedValue({ id, chatGptPrompt: 'Manual research prompt' }),
    startHandoff: jest.fn(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ResearchHandoffController],
      providers: [
        { provide: ResearchHandoffService, useValue: service },
        {
          provide: ResearchHandoffImportService,
          useValue: { importResearch: jest.fn() },
        },
      ],
    }).overrideGuard(IntelligenceOwnerGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('lists pending handoffs through the API prefix with pagination', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/intelligence/research-handoffs/pending?limit=10&offset=20')
      .expect(200);
    expect(result.body[0].status).toBe('PENDING_CHATGPT');
    expect(service.listPendingResearch).toHaveBeenCalledWith(10, 20);
  });
  it('returns a prompt for copying and validates UUIDs', async () => {
    await request(app.getHttpServer())
      .get(`/api/intelligence/research-handoffs/${id}`)
      .expect(200, { id, chatGptPrompt: 'Manual research prompt' });
    await request(app.getHttpServer())
      .get('/api/intelligence/research-handoffs/not-a-uuid')
      .expect(400);
  });
  it('validates list limits and status', async () => {
    await request(app.getHttpServer())
      .get('/api/intelligence/research-handoffs?limit=101')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/intelligence/research-handoffs?status=invalid')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/intelligence/research-handoffs?status=COMPLETED&limit=10')
      .expect(200);
    expect(service.list).toHaveBeenCalledWith('COMPLETED', 10, 0);
  });
  it('supports explicitly starting a handoff without invoking research', async () => {
    await request(app.getHttpServer())
      .post(`/api/intelligence/research-handoffs/${id}/start`)
      .expect(201);
    expect(service.startHandoff).toHaveBeenCalledWith(id);
  });
});
