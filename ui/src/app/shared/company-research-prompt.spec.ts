import { buildCompanyResearchPrompt } from './company-research-prompt';

describe('buildCompanyResearchPrompt', () => {
  it('should request slightly richer Hebrew summaries without allowing long output', () => {
    const prompt = buildCompanyResearchPrompt('Centrical');

    expect(prompt).toContain('Company name: Centrical');
    expect(prompt).toContain('company.summary: 2-4 concise sentences');
    expect(prompt).toContain('maximum 4 specific items');
    expect(prompt).toContain('natural Hebrew');
    expect(prompt).toContain('no markdown, code fences');
  });

  it('should use a safe fallback when the company name is empty', () => {
    expect(buildCompanyResearchPrompt('   ')).toContain('Company name: Unknown Company');
  });
});
