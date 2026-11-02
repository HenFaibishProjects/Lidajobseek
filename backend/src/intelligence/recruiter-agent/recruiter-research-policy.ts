export const RECRUITER_RESEARCH_DEPTHS = ['NONE', 'QUICK', 'FULL'] as const;
export type RecruiterResearchDepth = (typeof RECRUITER_RESEARCH_DEPTHS)[number];

export const RECRUITER_RESEARCH_POLICY = `Decide researchDepth and one short researchReason in this same analysis; never call another model for this decision.
Research costs money. Do not research merely because a company name appears.
NONE: receipts, final rejections, generic updates without action, pure cancellation without replacement/next step, unknown company identity, no meaningful active opportunity, or research adds no immediate value.
QUICK: direct recruiter outreach about a concrete company/role, asking whether the candidate is interested, or meaningful company interest before an interview is scheduled. Establish practical company/location/work-model fit.
FULL: an interview invitation, choosing an interview slot, scheduled/confirmed screening, active interview progression, or rescheduling an interview that remains active. Do not select FULL for a receipt, rejection, or cancellation without a next step.
Use sufficient saved company context instead of new research: NONE + USE_EXISTING_COMPANY when appropriate. Saved QUICK context is not a substitute for FULL investigation when serious progression justifies it; consider the saved report mode and age.
For a serious FULL situation, older saved reports without interviewInsights/workplaceSignals coverage may need a FULL upgrade. Empty sections that record unavailable evidence already count as investigated; do not retry inaccessible public data repeatedly.
RESEARCH_COMPANY requires researchDepth QUICK or FULL and companyResearchNeeded=true. NONE must never select RESEARCH_COMPANY. Unknown/blank company identity requires NONE; never invent an identity to enable research.
Keep other actions bounded; researchDepth is a cost/value decision, not permission for an additional planning loop.`;
