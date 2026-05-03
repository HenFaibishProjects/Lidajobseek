import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { Process } from '../processes/process.entity';
import { Interaction } from '../interactions/interaction.entity';
import { ProcessSummaryDto } from './dto/process-summary.dto';
import { InteractionSummaryDto } from './dto/interaction-summary.dto';
import { CareerChatDto } from './dto/career-chat.dto';

export interface AiSummaryResponse {
  summary: string;
  risks: string[];
  recommendedNextSteps: string[];
  followUpSuggestion: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface AiInteractionSummaryResponse {
  summary: string;
  positiveSignals: string[];
  riskSignals: string[];
  openQuestions: string[];
  recommendedNextSteps: string[];
  followUpDraft: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface CareerChatResponse {
  answer: string;
  suggestedActions: string[];
  relatedProcesses: Array<{ processId: number; company: string; role: string }>;
  confidence: 'low' | 'medium' | 'high';
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface ChatApiResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);
  private readonly apiKey: string | undefined;
  private readonly apiUrl: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Process)
    private readonly processRepository: EntityRepository<Process>,
    @InjectRepository(Interaction)
    private readonly interactionRepository: EntityRepository<Interaction>,
  ) {
    this.apiKey = this.configService.get<string>('DEEPSEEK_API_KEY');
    this.apiUrl =
      this.configService.get<string>('DEEPSEEK_API_URL') ??
      'https://api.deepseek.com';
  }

  async summarizeProcess(
    dto: ProcessSummaryDto,
    userId: number,
    userPricingPlan: string,
  ): Promise<AiSummaryResponse> {
    if (userPricingPlan !== 'premium' && userPricingPlan !== 'enterprise') {
      throw new ForbiddenException(
        'This feature requires a premium account. Please upgrade your plan.',
      );
    }

    if (!this.apiKey) {
      this.logger.error('AI_ASSISTANT_API_KEY is not configured');
      throw new ServiceUnavailableException(
        'AI assistant is not available at this time.',
      );
    }

    const process = await this.processRepository.findOne(
      { id: dto.processId, user: userId },
      { populate: ['interactions', 'reviews', 'contacts'] },
    );

    if (!process) {
      throw new NotFoundException(
        `Process with ID ${dto.processId} not found.`,
      );
    }

    const context = this.buildContext(process, dto.userQuestion);
    this.logger.log(
      `AI summary requested for process ${dto.processId} by user ${userId}`,
    );

    const raw = await this.callAiProvider(context);
    return this.parseResponse(raw);
  }

  async summarizeInteraction(
    dto: InteractionSummaryDto,
    userId: number,
    userPricingPlan: string,
  ): Promise<AiInteractionSummaryResponse> {
    if (userPricingPlan !== 'premium' && userPricingPlan !== 'enterprise') {
      throw new ForbiddenException(
        'This feature requires a premium account. Please upgrade your plan.',
      );
    }

    if (!this.apiKey) {
      this.logger.error('AI_ASSISTANT_API_KEY is not configured');
      throw new ServiceUnavailableException(
        'AI assistant is not available at this time.',
      );
    }

    const interaction = await this.interactionRepository.findOne(
      { id: dto.interactionId },
      { populate: ['process', 'process.user', 'process.reviews'] },
    );

    if (!interaction || (interaction.process.user as any).id !== userId) {
      throw new NotFoundException(
        `Interaction with ID ${dto.interactionId} not found.`,
      );
    }

    const context = this.buildInteractionContext(
      interaction,
      dto.userQuestion,
    );
    this.logger.log(
      `AI interaction summary requested for interaction ${dto.interactionId} by user ${userId}`,
    );

    const raw = await this.callAiProvider(context);
    return this.parseInteractionResponse(raw);
  }

  private buildContext(process: Process, userQuestion?: string): string {
    const interactions = process.interactions
      .getItems()
      .map((i) => {
        const participants =
          (i.participants as any[])
            ?.map((p: any) => `${p.name} (${p.role})`)
            .join(', ') || 'none';
        return `- ${i.interviewType} on ${i.date.toISOString().slice(0, 10)}: ${i.summary || 'no summary'}. Participants: ${participants}. Notes: ${i.notes || 'none'}`;
      })
      .join('\n');

    const reviews = process.reviews
      .getItems()
      .map(
        (r) =>
          `- Stage: ${r.stage}. Confidence: ${r.confidence}. Went well: ${r.whatWentWell || 'not noted'}. Issues: ${r.whatFailed || 'not noted'}. Gaps: ${r.gaps || 'not noted'}.`,
      )
      .join('\n');

    const contacts = process.contacts
      .getItems()
      .map((c) => `- ${c.name} (${c.role})`)
      .join('\n');

    const scores = [
      `Tech: ${process.scoreTech}/10`,
      `Work-Life Balance: ${process.scoreWLB}/10`,
      `Growth: ${process.scoreGrowth}/10`,
      `Culture/Vibe: ${process.scoreVibe}/10`,
    ].join(', ');

    const compensation: string[] = [];
    if (process.salaryExpectation)
      compensation.push(
        `Expected: ${process.salaryExpectation} ${process.salaryCurrency ?? 'ILS'}/${process.salaryPeriod ?? 'Month'}`,
      );
    if (process.baseSalary)
      compensation.push(`Offered base: ${process.baseSalary}`);
    if (process.equity) compensation.push(`Equity: ${process.equity}`);
    if (process.bonus) compensation.push(`Bonus: ${process.bonus}`);
    if (process.signingBonus)
      compensation.push(`Signing bonus: ${process.signingBonus}`);
    if (process.benefits) compensation.push(`Benefits: ${process.benefits}`);

    const followUp = process.nextFollowUp
      ? process.nextFollowUp.toISOString().slice(0, 10)
      : 'not set';

    const offerDeadline = process.offerDeadline
      ? process.offerDeadline.toISOString().slice(0, 10)
      : 'not set';

    return `
You are an AI career assistant. Analyze ONLY the data provided below. Do not invent facts.
If a field is missing or empty, say so. Be professional, concise, and practical.

== JOB APPLICATION DATA ==
Company: ${process.companyName}
Role: ${process.roleTitle}
Tech stack: ${process.techStack || 'not specified'}
Location: ${process.location || 'not specified'} (${process.workMode}${process.daysFromOffice ? `, ${process.daysFromOffice} days/week in office` : ''})
Source/how found: ${process.source || 'not specified'}
Initiated by: ${process.initiatedBy || 'not specified'}

Current stage: ${process.currentStage}
Application started: ${process.initialInviteDate?.toISOString().slice(0, 10) ?? 'not set'}
Next follow-up date: ${followUp}
Offer deadline: ${offerDeadline}

Decision scores: ${scores}
${compensation.length ? `Compensation: ${compensation.join('; ')}` : 'Compensation: not specified'}

Notes from initial call: ${process.dataFromThePhoneCall || 'none'}
Initial invite content: ${process.initialInviteContent || 'none'}

== INTERACTIONS (${process.interactions.length}) ==
${interactions || 'No interactions recorded.'}

== SELF-REVIEWS (${process.reviews.length}) ==
${reviews || 'No self-reviews recorded.'}

== CONTACTS (${process.contacts.length}) ==
${contacts || 'No contacts recorded.'}
${userQuestion ? `\n== USER QUESTION ==\n${userQuestion}` : ''}

== INSTRUCTIONS ==
Respond ONLY as a JSON object with this exact structure (no markdown, no extra text):
{
  "summary": "2-3 sentence summary of where this application stands",
  "risks": ["risk 1", "risk 2"],
  "recommendedNextSteps": ["step 1", "step 2"],
  "followUpSuggestion": "one concrete follow-up action",
  "confidence": "low|medium|high"
}

Use "low" confidence if key data is missing (no interactions, no stage info, etc.).
Use "medium" if there is some data but important gaps.
Use "high" if data is rich enough to give a solid assessment.
`.trim();
  }

  private buildInteractionContext(
    interaction: Interaction,
    userQuestion?: string,
  ): string {
    const process = interaction.process as Process;

    const participants =
      Array.isArray(interaction.participants) && interaction.participants.length
        ? (interaction.participants as any[])
            .map((p: any) => `  - ${p.name} (${p.role})`)
            .join('\n')
        : '  none recorded';

    const nextRound = interaction.nextInviteStatus
      ? [
          `Status: ${interaction.nextInviteStatus}`,
          interaction.nextInviteType
            ? `Type: ${interaction.nextInviteType}`
            : null,
          interaction.nextInviteDate
            ? `Date: ${interaction.nextInviteDate.toISOString().slice(0, 10)}`
            : null,
        ]
          .filter(Boolean)
          .join(', ')
      : 'not recorded';

    const reviews = (process.reviews as any)?.getItems?.() ?? [];
    const matchedReview = reviews.find(
      (r: any) =>
        r.stage?.toLowerCase() === interaction.interviewType?.toLowerCase(),
    ) ?? reviews[reviews.length - 1];

    const selfReview = matchedReview
      ? [
          `Confidence: ${matchedReview.confidence}/5`,
          `What went well: ${matchedReview.whatWentWell || 'not noted'}`,
          `What failed: ${matchedReview.whatFailed || 'not noted'}`,
          `Gaps: ${matchedReview.gaps || 'not noted'}`,
        ].join('\n')
      : 'No self-review recorded for this interview.';

    return `
You are an AI career assistant helping a candidate debrief a specific interview.
Analyze ONLY the data provided. Do not invent company information or guess interviewer intent as fact.
You may identify possible positive/negative/neutral signals but must mark them as signals, not facts.
Be practical, concise, and professional. Focus on helping the user prepare their next move.

== COMPANY & ROLE ==
Company: ${process.companyName}
Role: ${process.roleTitle}
Tech stack: ${process.techStack || 'not specified'}
Current application stage: ${process.currentStage}

== THIS INTERVIEW ==
Type: ${interaction.interviewType}
Date: ${interaction.date.toISOString().slice(0, 10)}
Participants:
${participants}

Conversation summary: ${interaction.summary || 'not provided'}
Technical assessment notes: ${interaction.testsAssessment || 'not provided'}
Role/team insights gathered: ${interaction.roleInsights || 'not provided'}
Private notes / heads-up: ${interaction.headsup || 'not provided'}
Additional notes: ${interaction.notes || 'not provided'}

Next round status: ${nextRound}

== SELF-REVIEW ==
${selfReview}
${userQuestion ? `\n== USER QUESTION ==\n${userQuestion}` : ''}

== INSTRUCTIONS ==
Respond ONLY as a JSON object with this exact structure (no markdown, no extra text):
{
  "summary": "2-3 sentence debrief of how this interview went based on provided data",
  "positiveSignals": ["signal 1", "signal 2"],
  "riskSignals": ["signal 1", "signal 2"],
  "openQuestions": ["question 1", "question 2"],
  "recommendedNextSteps": ["step 1", "step 2"],
  "followUpDraft": "a short professional follow-up message the candidate could send after this interview",
  "confidence": "low|medium|high"
}

Use "low" confidence if key data is missing (no summary, no participants, no self-review).
Use "medium" if there is partial data.
Use "high" if the data is rich enough for a solid debrief.
If critical data is missing, still return the JSON but explain the limitation in the summary field.
`.trim();
  }

  private async callAiProvider(prompt: string): Promise<string> {
    const messages: ChatMessage[] = [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Generate the structured summary now.' },
    ];

    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          temperature: 0.3,
          max_tokens: 800,
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        this.logger.error('AI provider request timed out');
        throw new ServiceUnavailableException(
          'AI assistant request timed out. Please try again.',
        );
      }
      this.logger.error('AI provider network error', err?.message);
      throw new ServiceUnavailableException(
        'AI assistant is temporarily unavailable.',
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      this.logger.error(`AI provider HTTP ${response.status}: ${errorText}`);
      throw new ServiceUnavailableException(
        'AI assistant returned an error. Please try again later.',
      );
    }

    const data = (await response.json()) as ChatApiResponse;
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      this.logger.error('AI provider returned empty content');
      throw new InternalServerErrorException(
        'AI assistant returned an empty response.',
      );
    }

    return content;
  }

  private parseResponse(raw: string): AiSummaryResponse {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.warn('Could not extract JSON from AI response');
      return this.fallbackResponse();
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<AiSummaryResponse>;
      return {
        summary: parsed.summary || 'No summary available.',
        risks: Array.isArray(parsed.risks) ? parsed.risks : [],
        recommendedNextSteps: Array.isArray(parsed.recommendedNextSteps)
          ? parsed.recommendedNextSteps
          : [],
        followUpSuggestion:
          parsed.followUpSuggestion || 'No follow-up suggestion available.',
        confidence: ['low', 'medium', 'high'].includes(
          parsed.confidence as string,
        )
          ? (parsed.confidence as 'low' | 'medium' | 'high')
          : 'low',
      };
    } catch {
      this.logger.warn('Failed to parse AI response JSON');
      return this.fallbackResponse();
    }
  }

  private parseInteractionResponse(raw: string): AiInteractionSummaryResponse {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.warn('Could not extract JSON from AI interaction response');
      return this.fallbackInteractionResponse();
    }

    try {
      const parsed = JSON.parse(
        jsonMatch[0],
      ) as Partial<AiInteractionSummaryResponse>;
      return {
        summary: parsed.summary || 'No summary available.',
        positiveSignals: Array.isArray(parsed.positiveSignals)
          ? parsed.positiveSignals
          : [],
        riskSignals: Array.isArray(parsed.riskSignals)
          ? parsed.riskSignals
          : [],
        openQuestions: Array.isArray(parsed.openQuestions)
          ? parsed.openQuestions
          : [],
        recommendedNextSteps: Array.isArray(parsed.recommendedNextSteps)
          ? parsed.recommendedNextSteps
          : [],
        followUpDraft:
          parsed.followUpDraft || 'No follow-up draft available.',
        confidence: ['low', 'medium', 'high'].includes(
          parsed.confidence as string,
        )
          ? (parsed.confidence as 'low' | 'medium' | 'high')
          : 'low',
      };
    } catch {
      this.logger.warn('Failed to parse AI interaction response JSON');
      return this.fallbackInteractionResponse();
    }
  }

  private fallbackResponse(): AiSummaryResponse {
    return {
      summary: 'Unable to generate a summary at this time.',
      risks: [],
      recommendedNextSteps: [],
      followUpSuggestion: 'Please try again later.',
      confidence: 'low',
    };
  }

  private fallbackInteractionResponse(): AiInteractionSummaryResponse {
    return {
      summary: 'Unable to generate a debrief at this time.',
      positiveSignals: [],
      riskSignals: [],
      openQuestions: [],
      recommendedNextSteps: [],
      followUpDraft: 'Please try again later.',
      confidence: 'low',
    };
  }

  async careerChat(
    dto: CareerChatDto,
    userId: number,
    userPricingPlan: string,
  ): Promise<CareerChatResponse> {
    if (userPricingPlan !== 'premium' && userPricingPlan !== 'enterprise') {
      throw new ForbiddenException(
        'This feature requires a premium account. Please upgrade your plan.',
      );
    }

    if (!dto.message?.trim()) {
      throw new BadRequestException('message is required.');
    }

    if (!this.apiKey) {
      this.logger.error('AI_ASSISTANT_API_KEY is not configured');
      throw new ServiceUnavailableException(
        'AI assistant is not available at this time.',
      );
    }

    const processes = await this.processRepository.find(
      { user: userId },
      { populate: ['interactions', 'reviews'] },
    );

    this.logger.log(`Career chat requested by user ${userId}`);

    const context = this.buildCareerContext(processes, dto.message.trim());
    const raw = await this.callAiProvider(context);
    return this.parseCareerResponse(raw);
  }

  private buildCareerContext(processes: Process[], userMessage: string): string {
    const now = new Date();
    const closedStages = ['rejected', 'reject', 'withdrawn', 'offer declined'];
    const offerStages = ['offer', 'offer received', 'offer extended'];

    const active = processes.filter(
      (p) => !closedStages.includes(p.currentStage?.toLowerCase() ?? ''),
    );
    const closed = processes.filter((p) =>
      closedStages.includes(p.currentStage?.toLowerCase() ?? ''),
    );
    const offers = processes.filter((p) =>
      offerStages.includes(p.currentStage?.toLowerCase() ?? ''),
    );

    // Stale: active processes not updated in 14+ days
    const staleThreshold = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const stale = active
      .filter((p) => new Date(p.updatedAt) < staleThreshold)
      .slice(0, 5)
      .map((p) => `  - ${p.companyName} / ${p.roleTitle} (stage: ${p.currentStage}, last updated: ${new Date(p.updatedAt).toISOString().slice(0, 10)})`);

    // Stage breakdown
    const stageCounts: Record<string, number> = {};
    for (const p of active) {
      const s = p.currentStage || 'Unknown';
      stageCounts[s] = (stageCounts[s] ?? 0) + 1;
    }
    const stageBreakdown = Object.entries(stageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([s, n]) => `  - ${s}: ${n}`)
      .join('\n');

    // Top scored
    const topScored = [...active]
      .filter((p) => (p.scoreTech ?? 0) + (p.scoreWLB ?? 0) + (p.scoreGrowth ?? 0) + (p.scoreVibe ?? 0) > 0)
      .sort(
        (a, b) =>
          ((b.scoreTech ?? 0) + (b.scoreWLB ?? 0) + (b.scoreGrowth ?? 0) + (b.scoreVibe ?? 0)) -
          ((a.scoreTech ?? 0) + (a.scoreWLB ?? 0) + (a.scoreGrowth ?? 0) + (a.scoreVibe ?? 0)),
      )
      .slice(0, 3)
      .map(
        (p) =>
          `  - ${p.companyName} / ${p.roleTitle}: avg score ${(((p.scoreTech ?? 0) + (p.scoreWLB ?? 0) + (p.scoreGrowth ?? 0) + (p.scoreVibe ?? 0)) / 4).toFixed(1)}/10`,
      )
      .join('\n');

    // Upcoming interviews from nextInviteStatus
    const upcoming: string[] = [];
    for (const p of active) {
      for (const i of p.interactions.getItems()) {
        if (
          i.nextInviteStatus === 'Scheduled' &&
          i.nextInviteDate &&
          new Date(i.nextInviteDate) > now
        ) {
          upcoming.push(
            `  - ${p.companyName} / ${p.roleTitle}: ${i.nextInviteType || 'Interview'} on ${new Date(i.nextInviteDate).toISOString().slice(0, 10)}`,
          );
          if (upcoming.length >= 5) break;
        }
      }
      if (upcoming.length >= 5) break;
    }

    // Recent interactions (last 5)
    const allInteractions: Array<{ date: Date; company: string; role: string; type: string; summary: string }> = [];
    for (const p of processes) {
      for (const i of p.interactions.getItems()) {
        allInteractions.push({
          date: new Date(i.date),
          company: p.companyName,
          role: p.roleTitle,
          type: i.interviewType,
          summary: (i.summary || '').slice(0, 100),
        });
      }
    }
    const recentInteractions = allInteractions
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 5)
      .map(
        (i) =>
          `  - ${i.date.toISOString().slice(0, 10)} | ${i.company} / ${i.role} | ${i.type}: ${i.summary}`,
      )
      .join('\n');

    // Recent self-reviews (last 3)
    const allReviews: Array<{ createdAt: Date; company: string; stage: string; confidence: number; wentWell: string }> = [];
    for (const p of processes) {
      for (const r of p.reviews.getItems()) {
        allReviews.push({
          createdAt: new Date(r.createdAt),
          company: p.companyName,
          stage: r.stage,
          confidence: r.confidence,
          wentWell: (r.whatWentWell || '').slice(0, 80),
        });
      }
    }
    const recentReviews = allReviews
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 3)
      .map(
        (r) =>
          `  - ${r.company} / ${r.stage}: confidence ${r.confidence}/5. Went well: ${r.wentWell || 'not noted'}`,
      )
      .join('\n');

    // Follow-ups
    const followUps = active
      .filter((p) => p.nextFollowUp && new Date(p.nextFollowUp) >= now)
      .sort((a, b) => new Date(a.nextFollowUp!).getTime() - new Date(b.nextFollowUp!).getTime())
      .slice(0, 3)
      .map(
        (p) =>
          `  - ${p.companyName} / ${p.roleTitle}: follow-up on ${new Date(p.nextFollowUp!).toISOString().slice(0, 10)}`,
      )
      .join('\n');

    // Offer deadlines
    const deadlines = processes
      .filter((p) => p.offerDeadline)
      .map(
        (p) =>
          `  - ${p.companyName} / ${p.roleTitle}: deadline ${new Date(p.offerDeadline!).toISOString().slice(0, 10)}`,
      )
      .join('\n');

    // Offer process names for relatedProcesses hint
    const offerList = offers
      .slice(0, 3)
      .map((p) => `  - ${p.companyName} / ${p.roleTitle} (id: ${p.id})`)
      .join('\n');

    const allProcessesList = processes
      .slice(0, 20)
      .map((p) => `  - id:${p.id} | ${p.companyName} / ${p.roleTitle} | stage: ${p.currentStage}`)
      .join('\n');

    return `
You are an AI career assistant for a job seeker. Answer ONLY using the data provided below.
Do not invent company facts, do not claim external knowledge, and do not make hiring outcome predictions as facts.
Be practical, concise, and career-focused. Give clear next steps when possible.
If the question is outside the available data, explain that clearly.

== JOB SEARCH OVERVIEW ==
Total applications: ${processes.length}
Active: ${active.length}
Closed/Rejected/Withdrawn: ${closed.length}
Offers: ${offers.length}

== ACTIVE APPLICATIONS BY STAGE ==
${stageBreakdown || '  (none)'}

== TOP SCORED OPPORTUNITIES ==
${topScored || '  (no scores set)'}

== UPCOMING SCHEDULED INTERVIEWS ==
${upcoming.join('\n') || '  (none scheduled)'}

== STALE ACTIVE APPLICATIONS (no activity 14+ days) ==
${stale.join('\n') || '  (none)'}

== PENDING FOLLOW-UPS ==
${followUps || '  (none set)'}

== OFFER DEADLINES ==
${deadlines || '  (none)'}

== OFFERS RECEIVED ==
${offerList || '  (none)'}

== RECENT INTERACTIONS (last 5) ==
${recentInteractions || '  (none recorded)'}

== RECENT SELF-REVIEWS (last 3) ==
${recentReviews || '  (none recorded)'}

== ALL APPLICATIONS (for reference) ==
${allProcessesList || '  (none)'}

== USER QUESTION ==
${userMessage}

== INSTRUCTIONS ==
Respond ONLY as a JSON object with this exact structure (no markdown, no extra text):
{
  "answer": "direct answer to the user question, 2-4 sentences, practical and career-focused",
  "suggestedActions": ["action 1", "action 2", "action 3"],
  "relatedProcesses": [
    { "processId": <number>, "company": "<string>", "role": "<string>" }
  ],
  "confidence": "low|medium|high"
}

Rules for relatedProcesses: only include process IDs that appear in the data above. Max 3.
Use "low" confidence if the user has no applications or very limited data.
Use "medium" if there is partial data.
Use "high" if the data is rich enough for a confident answer.
`.trim();
  }

  private parseCareerResponse(raw: string): CareerChatResponse {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.warn('Could not extract JSON from AI career chat response');
      return this.fallbackCareerResponse();
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<CareerChatResponse>;
      return {
        answer: parsed.answer || 'No answer available.',
        suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : [],
        relatedProcesses: Array.isArray(parsed.relatedProcesses)
          ? parsed.relatedProcesses.filter(
              (p): p is { processId: number; company: string; role: string } =>
                typeof p === 'object' && p !== null && typeof p.processId === 'number',
            )
          : [],
        confidence: ['low', 'medium', 'high'].includes(parsed.confidence as string)
          ? (parsed.confidence as 'low' | 'medium' | 'high')
          : 'low',
      };
    } catch {
      this.logger.warn('Failed to parse AI career chat response JSON');
      return this.fallbackCareerResponse();
    }
  }

  private fallbackCareerResponse(): CareerChatResponse {
    return {
      answer: 'Unable to generate an answer at this time. Please try again.',
      suggestedActions: [],
      relatedProcesses: [],
      confidence: 'low',
    };
  }
}
