# Lidajobseek — Product Vision & Feature Roadmap

---

## What Is This Tool?

**Lidajobseek** is a personal job search command center. It gives job seekers one place to track every application, every conversation, every interview, and every decision — so nothing falls through the cracks and the process stays manageable even when juggling 20+ companies at once.

It is built for people who take their job search seriously: software engineers, product managers, designers, or any professional running a structured search. It is especially valuable for people who are actively interviewing at multiple companies simultaneously and need to stay organised, confident, and sharp at every stage.

---

## Who Is It For?

| Persona | Pain it solves |
|---|---|
| **Active job seeker (3–6 month search)** | Loses track of where things stand with each company, forgets to follow up, can't remember what was discussed in an interview |
| **Passive job seeker (exploring options)** | Wants to evaluate a few opportunities without a spreadsheet mess |
| **Career pivoter** | Needs to track a large volume of applications across different industries |
| **Senior / staff engineer** | Negotiating multiple offers, needs a clear comparison and decision framework |
| **Bootcamp / new grad** | Overwhelmed, no prior system, needs structure from day one |

---

## What Can It Do Today?

### Job Application Management (Processes)
- Create a full record for each job application: company, role, tech stack, location, work mode, salary expectation (currency, base, equity, bonus, signing bonus, benefits)
- Track the current stage (custom stages, auto-updates to "No Response (14+ Days)" after two weeks of inactivity)
- Record how the process started: invite date, method, who initiated it, first contact channel, invitation content
- Set offer deadline and next follow-up reminders
- Score each opportunity on four axes: **Tech**, **Work-Life Balance**, **Growth**, **Vibe** (1–10 each)

### Interview Logging (Interactions)
- Log every interview or communication: phone screen, coffee chat, virtual video, on-site, technical assessment, etc.
- Record participants (name + role), which auto-adds them to the contacts list
- Write a summary of the conversation, technical assessment notes, and role insights learned
- Add pre-interview notes and heads-up for yourself
- Set an **email reminder** before the interview (configurable lead time in minutes)
- Track whether a next interview was extended (yes / later / no), and if yes — link, date, and type

### Self-Assessment Reviews
- After each interview, log a self-review: which stage, confidence rating (1–5), what went well, what failed, and gaps to close
- Builds a personal learning log across the entire job search

### Contact Network Tracking
- Every interviewer or recruiter you add as a participant gets saved as a contact
- Stores name, role, LinkedIn, social handles, email
- Contacts are linked to their respective process

### Professional Profile & CV
- A structured profile editor covering: bio, top skills, activity (talks, publications, awards), past companies, experience, private projects, education, certifications, links
- Generates a clean professional CV from this data on demand
- Two modes: plain formatted template or AI-enhanced (premium)
- Export to PDF

### Resource Library
- Upload and tag documents: resumes, cover letters, Excel trackers, anything relevant (PDF, Word, Excel, up to 5 MB per file)
- Retrieve and manage from one place

### Analytics Dashboard
- Visual charts and data about your job search: applications over time, stage distribution, response rate, offer outcomes

### Decision Board
- Side-by-side visual comparison of scored opportunities using the four decision dimensions

### Calendar View
- All upcoming interviews on a calendar grid
- Click to view or edit any interaction

### Coach Hub
- Career coaching and AI-powered guidance for interview prep, negotiation, and job search strategy

### User Preferences & Accessibility
- Full dark/light/auto theme
- Date format preference (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD)
- Time format (12h / 24h)
- Country preference
- Custom avatar style
- WCAG 2.1 accessible design
- Keyboard shortcut system (Ctrl+N, Ctrl+H, Ctrl+A, Ctrl+C, Ctrl+K, ?, Esc, and more)

### Data Portability
- Full JSON export of all data
- Import with overwrite or append mode

---

## Free vs Premium: Recommended Split

The philosophy: the free tier should make Lidajobseek genuinely useful and sticky. Users who rely on it daily will hit a natural ceiling and upgrade. Premium is not about locking the core — it is about unlocking power that makes the tool extraordinary for people who are serious.

---

### Free Tier — The Full Tracking Engine

Everything a user needs to run a structured job search, for free, forever.

| Feature | Notes |
|---|---|
| Unlimited job application records (processes) | |
| Full CRUD: create, edit, delete applications | |
| Interview logging (unlimited interactions per process) | |
| Participant tracking → auto-contacts | |
| Self-assessment reviews | |
| Salary fields and offer tracking | |
| Decision scoring matrix (Tech / WLB / Growth / Vibe) | |
| Decision board (visual comparison) | |
| Stage pipeline with auto-stale detection | |
| Calendar view | |
| Profile editor (all fields) | |
| CV generation — template mode (no AI) | |
| CV PDF export | |
| Resource library — up to **3 files, 5 MB each** | |
| Email reminders for interviews | |
| Analytics — basic charts (applications over time, stage breakdown) | |
| Dark mode + theme preferences | |
| Keyboard shortcuts | |
| Full JSON export | |
| JSON import (append mode only) | |

What free does NOT include: AI features, SMS reminders, advanced analytics, bulk import/overwrite, Coach Hub AI, and a higher resource storage quota.

---

### Premium Tier — The AI-Powered Career Weapon

For users who are deeply invested in their search and want intelligence, not just organisation. Recommended price: **$12/month or $99/year**.

| Feature | What it does |
|---|---|
| **AI CV enhancement** | DeepSeek AI rewrites your raw profile data into a polished, professional CV — reads your skills and experience and makes them land harder |
| **AI field suggestions** | Click "improve" on any profile field and get a rewritten version optimised for impact |
| **AI process insights** | Ask the AI to analyse a specific job application: what are the risks, what should you research before the interview, how does this company typically interview, is this role worth pursuing based on your goals |
| **AI interaction summary** | After logging an interview, get an AI-generated summary of what signals you received (positive, negative, neutral) and what you should do next |
| **AI decision advisor** | Feed it your top 2–3 scored opportunities and get a recommendation with reasoning: which to prioritise, what is worth negotiating, what red flags to watch |
| **AI coach (Coach Hub)** | Ongoing AI career coaching: answer questions, help prep for specific interview types, give negotiation scripts, cold outreach templates, follow-up email drafts |
| **SMS interview reminders** | In addition to email, get a text message before each interview |
| **Advanced analytics** | Response rate by source, average days per stage, acceptance rate, salary range distribution, comparison against your own baseline over time |
| **Full resource library** | Up to **50 files, 25 MB each** |
| **Import overwrite mode** | Full data replacement on import, not just append |
| **Priority email support** | Faster response from the team |
| **Early access to new features** | First to try new AI abilities and UI improvements |

---

## Additional Features to Build — Recommended Roadmap

These are my recommendations for what would make this tool genuinely stand out in the market.

### High Impact, Relatively Achievable

**1. Kanban board view**
A drag-and-drop pipeline view of all applications by stage. This is the most intuitive way to visualise "where am I with everything" and is standard in competitor tools. Free tier limited to 5 columns; premium gets full custom stages and column sorting.

**2. Follow-up automation (premium)**
Set a follow-up cadence (e.g., "if no response in 7 days, remind me to follow up") and the system generates a pre-drafted follow-up email or LinkedIn message for you to send. AI writes the message based on the original interaction context.

**3. LinkedIn / job board import (premium)**
A browser extension or paste-to-import function that extracts job listing data from LinkedIn, Indeed, or Glassdoor and pre-fills a new process. Saves 80% of the creation friction.

**4. Offer comparison export (free + premium)**
Generate a one-page comparison PDF of two or three offers for sharing with a partner, mentor, or advisor. Premium adds AI narrative ("Based on your scores, here is what these offers say about your priorities…").

**5. Interview prep checklist (free)**
Auto-generate a pre-interview checklist per interaction: review company website, re-read job description, check interviewer LinkedIn, prepare STAR stories for top skills, test the video link. Simple but high-value.

**6. Mood / energy tracking (free)**
Add a post-interview mood tag (energised, drained, neutral, excited, uncertain). Over time shows a pattern: which types of companies or roles left you feeling best. Subtle but insightful.

**7. Company research card (premium AI)**
One-click AI research pull on any company in your pipeline: funding stage, headcount growth trend, recent press, Glassdoor signal, tech stack. Pulled from public sources and summarised into a one-pager you can read before an interview.

**8. Salary benchmark (premium)**
Enter your role, location, and years of experience and get a salary percentile estimate sourced from public comp data (Levels.fyi, Glassdoor, etc.) so you can sanity-check your expectation and negotiate with data.

**9. Team / referral tracking**
Track internal referrals separately from cold applications, with a sub-record for the referring person and their relationship to you. Useful for measuring how much referrals improve your conversion rate.

**10. Goal setting and weekly digest (premium)**
Set a weekly goal (e.g., "apply to 5 companies, follow up on 3, complete 2 interviews"). Get a Monday morning digest email showing last week's actual vs goal, and what is coming up this week.

---

## Monetisation Model — Recommended Approach

### Payment Infrastructure: Stripe

Use **Stripe** for all payment processing. It handles:
- Monthly and annual subscriptions
- Automatic billing, retries, dunning
- Tax handling (VAT/GST where relevant)
- Customer portal for users to self-serve cancel, update card, or switch plan
- Webhooks to update `pricingPlan` on the `User` entity in real time

### What to build on the backend
- A `StripeModule` that creates a `CheckoutSession` and redirects to Stripe's hosted checkout
- Webhook handler (`POST /api/stripe/webhook`) that listens for `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
- On `deleted` → set `pricingPlan` back to `free`
- On `created` or `updated` → set `pricingPlan` to `premium`
- A `POST /api/billing/create-portal-session` endpoint that returns a Stripe Customer Portal URL so users can manage their subscription themselves

### What to build on the frontend
- The pricing page already exists (`/pricing`)
- Add a **"Upgrade"** CTA in the header for free users (small badge or button)
- When a premium-gated feature is accessed, show an inline upsell modal: "This is a premium feature. Upgrade for $12/month."
- After returning from Stripe checkout, show a "Welcome to premium" confirmation screen
- In the settings panel, show current plan + a "Manage subscription" button (links to Stripe portal)

### Pricing Recommendation

| Plan | Monthly | Annual | Target |
|---|---|---|---|
| **Free** | $0 | $0 | Everyone — acquisition funnel |
| **Premium** | $12/month | $99/year ($8.25/mo) | Active job seekers, 1–6 months |
| **Gift / Recruiter licence** | $35 one-time | — | Recruiter gifting to candidates, coaches |

The annual discount (~31%) is standard and drives commitment. Offer a **7-day free trial on premium** with no credit card required — this is the single highest-converting onboarding strategy for this type of tool.

### Cancellation Policy
When a user cancels:
- Their subscription remains active until the end of the paid billing period (no clawback)
- At period end, `pricingPlan` is set back to `free`
- Any AI-generated CV or AI content they saved remains accessible (it is their data)
- Any files above the free tier limit (> 3) become read-only (not deleted, but no new uploads)
- Show a cancellation survey (optional, one question): "Why are you leaving?" — this is high-signal product feedback
- Offer a one-time pause option (pause billing for 1 month) as an alternative to full cancellation

---

## Competitive Positioning

| Competitor | Their strength | Our edge |
|---|---|---|
| Notion / spreadsheet DIY | Flexible | Zero setup, purpose-built, AI-native |
| Huntr.co | UX polish, kanban view | More depth per application (self-reviews, decision scoring, CV generation) |
| Jobscan | ATS optimisation | Full lifecycle (not just resume, entire search) |
| Teal HQ | Modern design, free tier | AI decision advisor, interview-level granularity |
| LinkedIn Jobs | Network integration | Private, no employer data collection, full control |

The unique differentiator for Lidajobseek is **depth per application**. No competitor combines: interaction-level interview notes + self-reflection reviews + decision scoring matrix + AI analysis in one coherent tool.

---

## Summary

Lidajobseek is a production-ready, full-stack job search tracker that already covers everything a serious job seeker needs to stay organised. The free tier should be generous enough to build habit and loyalty. The premium tier converts users who feel the friction of not having AI during a high-stakes search — because a job search is one of the highest ROI moments to invest in a tool.

The roadmap priority: **payment integration first** (unlocks revenue), then **Kanban view** (highest requested feature in this category), then **LinkedIn import** and **AI follow-up drafting** (the two highest-friction moments in any job search).
