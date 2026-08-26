import { BadRequestException } from '@nestjs/common';
import { MailCoverageService } from './mail-coverage.service';

describe('MailCoverageService', () => {
  const userReference = { id: 7 };
  let repository: {
    create: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let entityManager: {
    assign: jest.Mock;
    flush: jest.Mock;
    getReference: jest.Mock;
    persistAndFlush: jest.Mock;
    removeAndFlush: jest.Mock;
  };
  let service: MailCoverageService;

  beforeEach(() => {
    repository = {
      create: jest.fn((data) => ({ id: 1, ...data })),
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
    };
    entityManager = {
      assign: jest.fn(),
      flush: jest.fn(),
      getReference: jest.fn().mockReturnValue(userReference),
      persistAndFlush: jest.fn(),
      removeAndFlush: jest.fn(),
    };
    service = new MailCoverageService(repository as any, entityManager as any);
  });

  it('creates an entry with normalized company name and dates', async () => {
    const result = await service.create(
      {
        companyName: '  Acme  ',
        note: '  Follow up with Dana next week  ',
        receivedCvEmail: true,
        receivedCvDate: '2026-08-20',
        rejectedEmail: true,
        rejectedDate: '2026-08-25',
      },
      7,
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: 'Acme',
        note: 'Follow up with Dana next week',
        receivedCvEmail: true,
        rejectedEmail: true,
        user: userReference,
      }),
    );
    expect(result.companyName).toBe('Acme');
    expect(entityManager.persistAndFlush).toHaveBeenCalled();
  });

  it('stores an empty note as null', async () => {
    await service.create(
      {
        companyName: 'Acme',
        note: '   ',
        receivedCvEmail: false,
        receivedCvDate: null,
        rejectedEmail: false,
        rejectedDate: null,
      },
      7,
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ note: null }),
    );
  });

  it('creates a process-linked entry when a process is rejected', async () => {
    await service.syncRejectedProcess('  Acme  ', 7);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: 'Acme',
        hadProcess: true,
        receivedCvEmail: false,
        rejectedEmail: false,
        user: userReference,
      }),
    );
    expect(entityManager.persistAndFlush).toHaveBeenCalled();
  });

  it('marks an existing entry instead of creating a duplicate', async () => {
    const existing = { id: 3, companyName: 'Acme', hadProcess: false };
    repository.findOne.mockResolvedValue(existing);

    const result = await service.syncRejectedProcess('Acme', 7);

    expect(result).toBe(existing);
    expect(existing.hadProcess).toBe(true);
    expect(repository.create).not.toHaveBeenCalled();
    expect(entityManager.flush).toHaveBeenCalled();
  });

  it('requires a date when an email is marked as received', async () => {
    await expect(
      service.create(
        {
          companyName: 'Acme',
          receivedCvEmail: true,
          receivedCvDate: null,
          rejectedEmail: false,
          rejectedDate: null,
        },
        7,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects impossible calendar dates', async () => {
    await expect(
      service.create(
        {
          companyName: 'Acme',
          receivedCvEmail: true,
          receivedCvDate: '2026-02-31',
          rejectedEmail: false,
          rejectedDate: null,
        },
        7,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not allow a rejection date before the CV received date', async () => {
    await expect(
      service.create(
        {
          companyName: 'Acme',
          receivedCvEmail: true,
          receivedCvDate: '2026-08-20',
          rejectedEmail: true,
          rejectedDate: '2026-08-19',
        },
        7,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
