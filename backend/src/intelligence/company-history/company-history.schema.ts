import { z } from 'zod';
import {
  employeeCountSchema,
  researchOriginSchema,
} from '../company-intelligence/company-report.schema';
import {
  QUICK_PRESENTATION_LIMITS,
  companyResearchReportSchema,
} from '../company-intelligence/company-report.presentation';

const MAX_BUILDING_FLOORS = 300;

function optionalText(maxCharacters: number) {
  return z
    .string()
    .trim()
    .max(maxCharacters)
    .nullable()
    .transform((value) => (value === '' ? null : value));
}

const manualFlagsSchema = z
  .array(z.string().trim().min(1).max(QUICK_PRESENTATION_LIMITS.flag))
  .max(QUICK_PRESENTATION_LIMITS.flags);

const manualEmployeeCountSchema = employeeCountSchema
  .nullable()
  .refine(
    (count) => count === null || !('min' in count) || count.min <= count.max,
    'Employee range minimum must not exceed its maximum',
  );

export const manualQuickUpdateSchema = z.strictObject({
  whatTheyDo: z.string().trim().min(1).max(QUICK_PRESENTATION_LIMITS.summary),
  workModel: optionalText(QUICK_PRESENTATION_LIMITS.workModel),
  greenFlags: manualFlagsSchema,
  redFlags: manualFlagsSchema,
  employees: z.strictObject({
    israel: manualEmployeeCountSchema,
    israelEngineering: manualEmployeeCountSchema,
    global: manualEmployeeCountSchema,
    verificationNote: optionalText(QUICK_PRESENTATION_LIMITS.workModel),
  }),
  location: z.strictObject({
    city: optionalText(QUICK_PRESENTATION_LIMITS.workModel),
    address: optionalText(QUICK_PRESENTATION_LIMITS.workModel),
    building: optionalText(QUICK_PRESENTATION_LIMITS.workModel),
    floor: optionalText(QUICK_PRESENTATION_LIMITS.workModel),
    buildingFloors: z
      .number()
      .int()
      .positive()
      .max(MAX_BUILDING_FLOORS)
      .nullable(),
    companyFloors: optionalText(QUICK_PRESENTATION_LIMITS.workModel),
    campus: optionalText(QUICK_PRESENTATION_LIMITS.workModel),
    verificationNote: optionalText(QUICK_PRESENTATION_LIMITS.workModel),
  }),
});
export type ManualQuickUpdate = z.output<typeof manualQuickUpdateSchema>;

export const companyHistoryItemSchema = z.strictObject({
  companyId: z.uuid(),
  companyName: z.string(),
  website: z.string().nullable(),
  researchedAt: z.iso.datetime(),
  manuallyUpdatedAt: z.iso.datetime().nullable(),
  whatTheyDo: z.string().nullable(),
  city: z.string().nullable(),
  evidenceLevel: z.enum(['strong', 'partial', 'limited']).nullable(),
  researchOrigin: researchOriginSchema.optional(),
});
export type CompanyHistoryItem = z.infer<typeof companyHistoryItemSchema>;

export const companyHistoryDetailSchema = z.strictObject({
  companyId: z.uuid(),
  researchedAt: z.iso.datetime(),
  manuallyUpdatedAt: z.iso.datetime().nullable(),
  report: companyResearchReportSchema,
});
export type CompanyHistoryDetail = z.infer<typeof companyHistoryDetailSchema>;

export const companyHistoryLookupSchema = z.union([
  z.strictObject({
    exists: z.literal(true),
    companyId: z.uuid(),
    companyName: z.string(),
  }),
  z.strictObject({ exists: z.literal(false) }),
]);
export type CompanyHistoryLookup = z.infer<typeof companyHistoryLookupSchema>;

export const companyHistoryLookupQuerySchema = z.strictObject({
  companyName: z.string().trim().min(1).max(200),
});
