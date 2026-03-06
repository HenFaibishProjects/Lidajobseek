export type InterviewTypeCategory = 'Format' | 'Assessment' | 'Meeting Type';

export interface InterviewTypeOption {
  id: string;
  label: string;
  category: InterviewTypeCategory;
  color: string;
}

export const DEFAULT_INTERVIEW_TYPE_ID = 'virtual_video';

export const INTERVIEW_TYPES: InterviewTypeOption[] = [
  // Standard Formats
  { id: 'phone_screen', label: 'Phone Screen', category: 'Format', color: '#3b82f6' }, // blue-500
  { id: 'virtual_video', label: 'Virtual Interview', category: 'Format', color: '#8b5cf6' }, // violet-500
  { id: 'onsite', label: 'On-site Interview', category: 'Format', color: '#10b981' }, // emerald-500
  { id: 'panel', label: 'Panel Interview', category: 'Format', color: '#6366f1' }, // indigo-500
  { id: 'async_video', label: 'One-Way / Async Video', category: 'Format', color: '#64748b' }, // slate-500

  // Assessments
  { id: 'tech_assessment', label: 'Technical Assessment', category: 'Assessment', color: '#ef4444' }, // red-500
  { id: 'take_home', label: 'Take-home Assessment', category: 'Assessment', color: '#f59e0b' }, // amber-500
  { id: 'live_coding', label: 'Live Coding / Pair', category: 'Assessment', color: '#dc2626' }, // red-600
  { id: 'system_design', label: 'System Design', category: 'Assessment', color: '#ea580c' }, // orange-600
  { id: 'case_study', label: 'Case Study', category: 'Assessment', color: '#14b8a6' }, // teal-500
  { id: 'portfolio', label: 'Portfolio Review', category: 'Assessment', color: '#0ea5e9' }, // sky-500
  { id: 'presentation', label: 'Presentation / Pitch', category: 'Assessment', color: '#84cc16' }, // lime-500

  // Meeting Types
  { id: 'behavioral', label: 'Behavioral / Culture Fit', category: 'Meeting Type', color: '#06b6d4' }, // cyan-500
  { id: 'hiring_manager', label: 'Hiring Manager', category: 'Meeting Type', color: '#a855f7' }, // purple-500
  { id: 'executive', label: 'Executive / VP', category: 'Meeting Type', color: '#d946ef' }, // fuchsia-500
  { id: 'team_meet', label: 'Team Meet & Greet', category: 'Meeting Type', color: '#ec4899' }, // pink-500
  { id: 'coffee_chat', label: 'Informal Coffee Chat', category: 'Meeting Type', color: '#b45309' } // amber-700
];

const LEGACY_INTERVIEW_TYPE_TO_ID: Record<string, string> = {
  // Call / Phone variations
  call: 'phone_screen',
  phone: 'phone_screen',
  
  // Virtual variations
  zoom: 'virtual_video',
  meet: 'virtual_video',
  teams: 'virtual_video',
  'Video Call': 'virtual_video',
  'video call': 'virtual_video',
  'online': 'virtual_video',
  
  // On-site variations
  frontal: 'onsite',
  'in person': 'onsite',
  'face to face': 'onsite',
  f2f: 'onsite',
  
  // Assessment variations
  'home assigment': 'take_home',
  'home assignment': 'take_home',
  homework: 'take_home',
  technical: 'tech_assessment',
  coding: 'live_coding',
  system: 'system_design',
  
  // Meeting Type variations
  hr: 'behavioral',
  culture: 'behavioral',
  'culture fit': 'behavioral',
  managerial: 'hiring_manager',
  manager: 'hiring_manager',
  exec: 'executive'
};

const INTERVIEW_TYPE_BY_ID = new Map(INTERVIEW_TYPES.map((type) => [type.id, type]));

export function normalizeInterviewType(interviewType: string | null | undefined): string {
  if (!interviewType) {
    return DEFAULT_INTERVIEW_TYPE_ID;
  }

  const raw = interviewType.toString().trim();
  if (!raw) {
    return DEFAULT_INTERVIEW_TYPE_ID;
  }

  if (INTERVIEW_TYPE_BY_ID.has(raw)) {
    return raw;
  }

  const lowerRaw = raw.toLowerCase();
  return LEGACY_INTERVIEW_TYPE_TO_ID[raw] || LEGACY_INTERVIEW_TYPE_TO_ID[lowerRaw] || raw;
}

export function getInterviewTypeLabel(interviewType: string | null | undefined): string {
  const normalized = normalizeInterviewType(interviewType);
  return INTERVIEW_TYPE_BY_ID.get(normalized)?.label || interviewType || 'Unknown';
}

export function getInterviewTypeColor(interviewType: string | null | undefined): string {
  const normalized = normalizeInterviewType(interviewType);
  return INTERVIEW_TYPE_BY_ID.get(normalized)?.color || '#6b7280'; // fallback gray
}

/**
 * Returns all interview types grouped by their category.
 * Highly useful for rendering categorized dropdowns/selects in the UI.
 */
export function getGroupedInterviewTypes(): Record<InterviewTypeCategory, InterviewTypeOption[]> {
  return INTERVIEW_TYPES.reduce((acc, type) => {
    if (!acc[type.category]) {
      acc[type.category] = [];
    }
    acc[type.category].push(type);
    return acc;
  }, {} as Record<InterviewTypeCategory, InterviewTypeOption[]>);
}

/**
 * Returns a specific interview type object by its ID or legacy string.
 */
export function getInterviewTypeOption(interviewType: string | null | undefined): InterviewTypeOption | undefined {
  const normalized = normalizeInterviewType(interviewType);
  return INTERVIEW_TYPE_BY_ID.get(normalized);
}