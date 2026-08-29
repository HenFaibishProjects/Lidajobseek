export function buildCompanyResearchPrompt(companyName?: string | null): string {
  const normalizedCompanyName = companyName?.trim() || 'Unknown Company';

  return `Research the following company as a potential employer.
Company name: ${normalizedCompanyName}
Country or location: Israel

Use web search and public sources only.

Research rules:
1. Verify that you found the correct company and do not mix it with similarly named companies.
2. Prefer official company sources, LinkedIn, career pages, reputable news sites, and established employee-review sites.
3. Do not guess. Use null when reliable information is unavailable, and mention important uncertainty in missing_information.
4. Focus on information useful to a job seeker: product, customers, company maturity, work culture, growth, hiring activity, and meaningful risks.
5. Do not repeat the same fact in multiple sections.

Content depth:
- company.summary: 2-4 concise sentences covering what the company does, its main product or customers, and relevant business context.
- workplace.reviews_summary: 2-4 concise sentences covering recurring employee themes such as culture, management, work-life balance, and career growth. Clearly distinguish employee reports from verified facts.
- hiring.open_roles_summary: 1-3 concise sentences describing current hiring activity and the main role areas, when reliable information is available.
- recent_news: maximum 3 relevant items; each summary should be 1-2 sentences.
- job_seeker_summary.overall_impression: 2-4 concise sentences with a balanced practical assessment for a candidate.
- positive_signals and concerns: maximum 4 specific items in each list.
- missing_information: maximum 3 useful items.
- sources: maximum 5 important sources used for the answer.
- Keep the result informative but compact. Avoid filler, generic praise, and long background history.

Language and formatting:
- Write all narrative summaries and list items in natural Hebrew.
- Keep company names, product names, technologies, and standard professional terms in their original English when that is clearer.
- Keep JSON keys and enum values in English.
- growth_trend must be one of: growing, stable, shrinking, unknown.
- work_model must be one of: remote, hybrid, onsite, mixed, unknown.
- Return exactly one valid JSON object with no markdown, code fences, comments, or text before or after it.
- Verify that the JSON is valid and properly escaped before returning it.

Return exactly this structure:
{
  "company": {
    "name": null,
    "website": null,
    "location": null,
    "industry": null,
    "summary": null,
    "employee_range": null,
    "growth_trend": "unknown"
  },
  "workplace": {
    "work_model": "unknown",
    "review_rating": null,
    "review_count": null,
    "reviews_summary": null
  },
  "hiring": {
    "is_hiring": null,
    "open_roles_summary": null
  },
  "recent_news": [
    {
      "date": null,
      "title": null,
      "summary": null,
      "source_url": null
    }
  ],
  "job_seeker_summary": {
    "overall_impression": null,
    "positive_signals": [],
    "concerns": [],
    "missing_information": []
  },
  "sources": [
    {
      "title": null,
      "url": null
    }
  ]
}`;
}
