import { EmailFilterDecision } from '../recruiter-agent.types';
import { prefilterRecruiterEmail } from './recruiter-email-prefilter';

const email = {
  id: 'synthetic',
  from: 'Recruiter <recruiter@example.com>',
  subject: 'Application update',
  body: '',
  receivedAt: new Date('2026-10-31T08:00:00Z'),
};

describe('Recruiter deterministic rejection rules', () => {
  it.each(['subject', 'body'] as const)(
    'passes after careful consideration alone in the %s',
    (field) => {
      expect(
        prefilterRecruiterEmail({
          ...email,
          [field]: 'After careful consideration',
        }),
      ).toMatchObject({
        shouldAnalyze: true,
        decision: EmailFilterDecision.PASS,
      });
    },
  );

  it.each([
    'We have decided to move forward with other candidates.',
    'החלטנו שלא להמשיך בתהליך',
  ])('still blocks explicit rejection: %s', (body) => {
    expect(prefilterRecruiterEmail({ ...email, body })).toMatchObject({
      shouldAnalyze: false,
      decision: EmailFilterDecision.REJECTION,
    });
  });

  it('ignores explicit rejection in quoted history', () => {
    expect(
      prefilterRecruiterEmail({
        ...email,
        body: 'Can we arrange an interview?\nOn Monday Recruiter wrote:\nWe have decided to move forward with other candidates.',
      }).shouldAnalyze,
    ).toBe(true);
  });
});
