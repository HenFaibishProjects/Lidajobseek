import { readFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { google, gmail_v1 } from 'googleapis';
import { GmailClientService } from './gmail-client.service';

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest
        .fn()
        .mockImplementation(() => ({ setCredentials: jest.fn() })),
    },
    gmail: jest.fn(),
  },
}));

function part(mimeType: string, text: string): gmail_v1.Schema$MessagePart {
  return { mimeType, body: { data: Buffer.from(text).toString('base64url') } };
}

describe('Gmail body extraction with synthetic MIME fixtures', () => {
  it('keeps Gmail read-only: auth scope and client contain no send/draft/write operations', () => {
    const auth = readFileSync(
      require.resolve('../scripts/gmail-auth.ts'),
      'utf8',
    );
    const scopes = auth.match(
      /https:\/\/www.googleapis.com\/auth\/gmail\.[a-z]+/g,
    );
    expect(scopes).toEqual(['https://www.googleapis.com/auth/gmail.readonly']);
    const source = readFileSync(
      require.resolve('./gmail-client.service.ts'),
      'utf8',
    );
    expect(source).not.toMatch(
      /messages\.(send|modify|delete|trash)|drafts\.|events\./,
    );
  });

  const get = jest.fn();
  let service: GmailClientService;

  beforeEach(() => {
    get.mockReset();
    jest.mocked(google.gmail).mockReturnValue({
      users: { messages: { get } },
    } as unknown as gmail_v1.Gmail);
    service = new GmailClientService(
      new ConfigService({
        GOOGLE_CLIENT_ID: 'synthetic-client',
        GOOGLE_CLIENT_SECRET: 'synthetic-secret',
        GOOGLE_REFRESH_TOKEN: 'synthetic-refresh',
      }),
    );
  });

  it.each([
    {
      name: 'root plain text',
      payload: part('text/plain', 'Interview tomorrow'),
      expected: 'Interview tomorrow',
    },
    {
      name: 'nested multipart plain text preferred over HTML',
      payload: {
        mimeType: 'multipart/mixed',
        parts: [
          {
            mimeType: 'multipart/alternative',
            parts: [
              part('text/html', '<p>HTML alternative</p>'),
              part('text/plain', 'Plain invitation'),
            ],
          },
        ],
      },
      expected: 'Plain invitation',
    },
    {
      name: 'root HTML only',
      payload: part('text/html', '<p>Interview &amp; details</p>'),
      expected: 'Interview & details',
    },
    {
      name: 'nested HTML only',
      payload: {
        mimeType: 'multipart/mixed',
        parts: [
          {
            mimeType: 'multipart/alternative',
            parts: [part('text/html', '<p>Interview details</p>')],
          },
        ],
      },
      expected: 'Interview details',
    },
    ...['', ' \r\n\t '].map((text) => ({
      name: `${text ? 'whitespace-only' : 'empty'} plain text falls back to usable HTML`,
      payload: {
        mimeType: 'multipart/alternative',
        parts: [
          part('text/plain', text),
          part('text/html', '<p>Usable invitation</p>'),
        ],
      },
      expected: 'Usable invitation',
    })),
    ...['', ' \n '].map((text) => ({
      name: `${text ? 'whitespace-only' : 'empty'} first plain part does not hide later plain text`,
      payload: {
        mimeType: 'multipart/mixed',
        parts: [
          part('text/plain', text),
          {
            mimeType: 'multipart/alternative',
            parts: [part('text/plain', 'Later invitation')],
          },
        ],
      },
      expected: 'Later invitation',
    })),
    {
      name: 'plain part without inline data does not hide later text',
      payload: {
        mimeType: 'multipart/mixed',
        parts: [
          { mimeType: 'text/plain', body: {} },
          part('text/plain', 'Later invitation'),
        ],
      },
      expected: 'Later invitation',
    },
    { name: 'genuinely empty payload', payload: {}, expected: '' },
    { name: 'missing payload', payload: undefined, expected: '' },
    {
      name: 'quoted history is retained for classifier context',
      payload: part(
        'text/plain',
        'New invitation\nOn Monday Recruiter wrote:\n> Earlier message',
      ),
      expected: 'New invitation\nOn Monday Recruiter wrote:\n> Earlier message',
    },
  ])('$name', async ({ payload, expected }) => {
    get.mockResolvedValue({
      data: { id: 'synthetic', internalDate: '1793433600000', payload },
    });
    expect((await service.getEmail('synthetic')).body).toBe(expected);
    expect(get).toHaveBeenCalledWith({
      userId: 'me',
      id: 'synthetic',
      format: 'full',
    });
  });
});
