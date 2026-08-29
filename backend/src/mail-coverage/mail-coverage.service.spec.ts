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
    persist: jest.Mock;
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
      persist: jest.fn(),
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

  it('bulk imports new companies and safely merges existing coverage', async () => {
    const existing = {
      id: 3,
      companyName: 'Acme',
      note: 'Keep this manual note',
      hadProcess: true,
      receivedCvEmail: false,
      receivedCvDate: null,
      rejectedEmail: false,
      rejectedDate: null,
    };
    repository.find.mockResolvedValue([existing]);

    const result = await service.importMany(
      [
        {
          companyName: 'Acme',
          note: 'Position: Backend Engineer',
          receivedCvEmail: true,
          receivedCvDate: '2026-08-11',
          rejectedEmail: true,
          rejectedDate: '2026-08-21',
        },
        {
          companyName: 'New Co',
          note: null,
          receivedCvEmail: true,
          receivedCvDate: '2026-08-20',
          rejectedEmail: false,
          rejectedDate: null,
        },
      ],
      7,
    );

    expect(entityManager.assign).toHaveBeenCalledWith(
      existing,
      expect.objectContaining({
        note: 'Keep this manual note',
        receivedCvEmail: true,
        rejectedEmail: true,
      }),
    );
    expect(existing.hadProcess).toBe(true);
    expect(entityManager.persist).toHaveBeenCalledWith([
      expect.objectContaining({ companyName: 'New Co', user: userReference }),
    ]);
    expect(entityManager.flush).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ created: 1, updated: 1, unchanged: 0, total: 2 });
  });

  it('bulk import reports unchanged records without flushing', async () => {
    repository.find.mockResolvedValue([
      {
        id: 3,
        companyName: 'Acme',
        note: null,
        hadProcess: false,
        receivedCvEmail: true,
        receivedCvDate: new Date('2026-08-11T12:00:00.000Z'),
        rejectedEmail: false,
        rejectedDate: null,
      },
    ]);

    const result = await service.importMany(
      [
        {
          companyName: 'Acme',
          note: null,
          receivedCvEmail: true,
          receivedCvDate: '2026-08-11',
          rejectedEmail: false,
          rejectedDate: null,
        },
      ],
      7,
    );

    expect(result.unchanged).toBe(1);
    expect(entityManager.flush).not.toHaveBeenCalled();
  });
});
