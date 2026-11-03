import { IntelligenceOwnerGuard } from '../guards/intelligence-owner.guard';
import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import request from 'supertest';
import { CompanyHistoryController } from './company-history.controller';
import { CompanyHistoryService } from './company-history.service';

const companyId = '5e7aa3dc-0f47-4fb0-a084-51e7bc527411';
const validBody = {
  whatTheyDo: 'Varonis מפתחת Data Security.',
  workModel: null,
  greenFlags: [],
  redFlags: [],
  employees: {
    israel: null,
    israelEngineering: null,
    global: null,
    verificationNote: null,
  },
  location: {
    city: 'הרצליה',
    address: null,
    building: null,
    floor: null,
    buildingFloors: null,
    companyFloors: null,
    campus: null,
    verificationNote: null,
  },
};

describe('Company history HTTP API', () => {
  let app: INestApplication<Server>;
  const service = {
    listHistory: jest.fn().mockResolvedValue([]),
    lookup: jest.fn().mockResolvedValue({ exists: false }),
    getDetail: jest.fn(),
    updateManually: jest.fn().mockResolvedValue({ companyId }),
    deleteCompany: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CompanyHistoryController],
      providers: [{ provide: CompanyHistoryService, useValue: service }],
    }).overrideGuard(IntelligenceOwnerGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => jest.clearAllMocks());

  it('lists history and looks up a company by name', async () => {
    await request(app.getHttpServer())
      .get('/api/intelligence/company/history')
      .expect(200)
      .expect([]);
    await request(app.getHttpServer())
      .get('/api/intelligence/company/history/lookup')
      .query({ companyName: ' Varonis ' })
      .expect(200)
      .expect({ exists: false });
    expect(service.lookup).toHaveBeenCalledWith('Varonis');
    await request(app.getHttpServer())
      .get('/api/intelligence/company/history/lookup')
      .expect(400);
  });

  it('returns COMPANY_NOT_FOUND as 404 and rejects malformed ids', async () => {
    service.getDetail.mockRejectedValueOnce(
      new NotFoundException({
        code: 'COMPANY_NOT_FOUND',
        message: 'Company was not found in history',
      }),
    );
    await request(app.getHttpServer())
      .get(`/api/intelligence/company/history/${companyId}`)
      .expect(404)
      .expect({
        code: 'COMPANY_NOT_FOUND',
        message: 'Company was not found in history',
      });
    await request(app.getHttpServer())
      .get('/api/intelligence/company/history/not-a-uuid')
      .expect(400);
    expect(service.getDetail).toHaveBeenCalledTimes(1);
  });

  it('validates manual updates with the dedicated schema', async () => {
    await request(app.getHttpServer())
      .patch(`/api/intelligence/company/history/${companyId}`)
      .send(validBody)
      .expect(200);
    expect(service.updateManually).toHaveBeenCalledWith(companyId, validBody);
    await request(app.getHttpServer())
      .patch(`/api/intelligence/company/history/${companyId}`)
      .send({ ...validBody, sources: [] })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/intelligence/company/history/${companyId}`)
      .send({ whatTheyDo: 'Partial update only' })
      .expect(400);
    expect(service.updateManually).toHaveBeenCalledTimes(1);
  });

  it('deletes a company with 204 No Content', async () => {
    await request(app.getHttpServer())
      .delete(`/api/intelligence/company/history/${companyId}`)
      .expect(204);
    expect(service.deleteCompany).toHaveBeenCalledWith(companyId);
  });
});
