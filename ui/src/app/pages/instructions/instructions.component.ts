import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

interface ModuleGuide {
  title: string;
  route: string;
  icon: string;
  description: string;
  bullets: string[];
}

@Component({
  selector: 'app-instructions',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './instructions.component.html',
  styleUrl: './instructions.component.css'
})
export class InstructionsComponent {
  readonly quickStartChecklist: string[] = [
    'Complete your Profile first so all your applications and coaching assets are aligned to your target role.',
    'Create your first Process and keep every company in one record (stages, interactions, and reviews).',
    'Schedule next steps in Calendar immediately after every call or interview.',
    'Use Coach Hub to store reusable interview answers, resume versions, and talking points.',
    'Review Analytics weekly to identify bottlenecks and improve your strategy.'
  ];

  readonly workflowSteps: Array<{ title: string; description: string; color: string }> = [
    {
      title: 'Capture',
      description: 'Log each application with company, role, source, and work mode so nothing gets lost.',
      color: '#3b82f6'
    },
    {
      title: 'Plan',
      description: 'Set next follow-ups and interview dates directly when new events happen.',
      color: '#8b5cf6'
    },
    {
      title: 'Execute',
      description: 'Track calls, technical tasks, and interview notes in the same process timeline.',
      color: '#f59e0b'
    },
    {
      title: 'Learn',
      description: 'Use reviews and Coach Hub to turn every interview into reusable preparation assets.',
      color: '#10b981'
    },
    {
      title: 'Optimize',
      description: 'Analyze conversion rates and focus your effort on channels with better outcomes.',
      color: '#ec4899'
    }
  ];

  readonly moduleGuides: ModuleGuide[] = [
    {
      title: 'Processes',
      route: '/',
      icon: '🧩',
      description: 'Your operational command center for job applications.',
      bullets: [
        'Add a new application with complete context and stage tracking.',
        'Filter and sort by stage, work mode, company, and activity status.',
        'Open each process to manage interactions, follow-ups, and reviews.'
      ]
    },
    {
      title: 'Calendar',
      route: '/calendar',
      icon: '🗓️',
      description: 'Time-based view of interviews, calls, and follow-up commitments.',
      bullets: [
        'Avoid missed deadlines by turning every next-step into a scheduled action.',
        'Balance preparation time before technical or final rounds.',
        'Use it as your weekly execution plan.'
      ]
    },
    {
      title: 'Analytics',
      route: '/analytics',
      icon: '📈',
      description: 'Performance intelligence to improve your funnel outcomes.',
      bullets: [
        'Track interview rate, rejection rate, and active pipeline size.',
        'See top channels and monthly volume trends.',
        'Use the data to decide where to invest effort next week.'
      ]
    },
    {
      title: 'Coach Hub',
      route: '/coach-hub',
      icon: '🧠',
      description: 'Structured knowledge base for interview preparation materials.',
      bullets: [
        'Store reusable answers, notes, CV versions, and key stories.',
        'Organize resources by category and tags for faster retrieval.',
        'Build a repeatable prep system instead of starting from zero each interview.'
      ]
    },
    {
      title: 'Profile + CV',
      route: '/profile',
      icon: '👤',
      description: 'Your career identity and baseline information.',
      bullets: [
        'Maintain accurate personal, role, and experience details.',
        'Use CV profile data to keep your applications and positioning consistent.',
        'Update frequently so insights and exports stay relevant.'
      ]
    }
  ];

  readonly proTips: string[] = [
    'Update stage immediately after each recruiter/interviewer interaction.',
    'Keep notes factual and short: what happened, what is next, and by when.',
    'Use one naming convention for companies and roles to keep analytics clean.',
    'Run a weekly review: close stale processes and prioritize high-probability opportunities.'
  ];
}
