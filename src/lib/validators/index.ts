import { z } from 'zod';

/** Shared Zod schemas. The same schema validates the form and the server action. */

const amountString = z
  .string()
  .min(1, 'Amount is required')
  .refine((v) => /^[\d,\s]*\.?\d*$/.test(v.trim()), 'Enter a valid number')
  .refine((v) => Number(v.replace(/[,\s]/g, '')) > 0, 'Amount must be greater than zero');

// ---------- Billing ----------

export const quickInvoiceSchema = z.object({
  clientId: z.string().optional(),
  clientName: z.string().optional(),
  amount: amountString,
  currency: z.enum(['INR', 'USD']).default('INR'),
  basis: z.enum(['EXCLUSIVE', 'INCLUSIVE']).default('EXCLUSIVE'),
  description: z.string().max(500).optional(),
  gstRate: z.coerce.number().min(0).max(100).optional(),
  discount: z.string().optional(),
  /// Left undefined so the client's own TDS setting applies; an explicit
  /// true/false from the modal overrides it for this one invoice.
  applyTds: z.boolean().optional(),
  dueDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
  sowId: z.string().optional(),
  projectId: z.string().optional(),
}).refine((v) => Boolean(v.clientId || v.clientName?.trim()), {
  message: 'Select a client or type a name',
  path: ['clientName'],
});

export type QuickInvoiceValues = z.infer<typeof quickInvoiceSchema>;

export const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: amountString,
  method: z.enum(['RAZORPAY', 'STRIPE', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'CASH', 'OTHER']),
  reference: z.string().max(120).optional(),
  tdsDeducted: z.string().optional(),
  paidAt: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export const creditNoteSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.string().optional(),
  reason: z.string().min(3, 'Give a reason — it is printed on the credit note').max(300),
});

export const recurringInvoiceSchema = z.object({
  clientId: z.string().min(1, 'Client is required'),
  title: z.string().min(2).max(160),
  amount: amountString,
  currency: z.enum(['INR', 'USD']).default('INR'),
  interval: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']).default('MONTHLY'),
  dayOfMonth: z.coerce.number().int().min(1).max(28).default(1),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  autoSend: z.boolean().default(false),
});

// ---------- Sales ----------

export const leadBaseSchema = z.object({
  name: z.string().min(2, 'Name is required').max(120),
  company: z.string().max(160).optional(),
  email: z.string().email('Enter a full email address, like name@company.com').optional().or(z.literal('')),
  phone: z.string().max(24).optional(),
  source: z.enum(['WEBSITE', 'REFERRAL', 'META_ADS', 'GOOGLE_ADS', 'LINKEDIN', 'COLD_OUTREACH', 'EVENT', 'WHATSAPP', 'OTHER']).default('OTHER'),
  sourceDetail: z.string().max(160).optional(),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST', 'DORMANT']).default('NEW'),
  estimatedValue: z.string().optional(),
  currency: z.enum(['INR', 'USD']).default('INR'),
  requirement: z.string().max(2000).optional(),
  city: z.string().max(80).optional(),
  stateCode: z.string().max(2).optional(),
  ownerId: z.string().optional(),
  nextFollowUpAt: z.string().optional(),
});

/** Create requires at least one contact method; updates may patch any subset. */
export const leadSchema = leadBaseSchema.refine((v) => Boolean(v.email || v.phone), {
  message: 'Provide at least an email or a phone number',
  path: ['email'],
});

export const leadNoteSchema = z.object({
  body: z.string().trim().min(1, 'Write something first').max(2000, 'Keep a note under 2000 characters'),
});

export const clientSchema = z.object({
  name: z.string().min(2, 'Name is required').max(160),
  legalName: z.string().max(200).optional(),
  gstin: z.string().max(15).optional().or(z.literal('')),
  pan: z.string().max(10).optional(),
  email: z.string().email('Enter a full email address, like name@company.com'),
  phone: z.string().max(24).optional(),
  website: z.string().url().optional().or(z.literal('')),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city: z.string().max(80).optional(),
  stateCode: z.string().max(2).optional(),
  postalCode: z.string().max(12).optional(),
  country: z.string().max(60).default('India'),
  currency: z.enum(['INR', 'USD']).default('INR'),
  paymentTermDays: z.coerce.number().int().min(0).max(180).default(15),
  applyTds: z.boolean().default(false),
  accountManagerId: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export const followUpSchema = z.object({
  leadId: z.string().optional(),
  clientId: z.string().optional(),
  channel: z.enum(['EMAIL', 'WHATSAPP', 'CALL', 'MEETING', 'SMS']),
  subject: z.string().min(2, 'Subject is required').max(200),
  notes: z.string().max(2000).optional(),
  dueAt: z.string().min(1, 'Due date is required'),
  assigneeId: z.string().optional(),
});

// ---------- SOW ----------

export const sowSchema = z.object({
  title: z.string().min(3).max(200),
  clientId: z.string().min(1, 'Client is required'),
  scope: z.string().min(10, 'Describe the scope'),
  deliverables: z.string().optional(),
  assumptions: z.string().optional(),
  outOfScope: z.string().optional(),
  timeline: z.string().optional(),
  paymentTerms: z.string().optional(),
  currency: z.enum(['INR', 'USD']).default('INR'),
  value: amountString,
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/** Letters only, single-spaced, lowercased — so "P. Sharma " matches "p sharma". */
const nameKey = (value: string) =>
  value.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();

export const sowSignSchema = z
  .object({
    token: z.string().min(1),
    signerName: z.string().min(2, 'Enter your full name').max(120),
    signerEmail: z.string().email('Enter a full email address, like name@company.com'),
    signerTitle: z.string().max(120).optional(),
    signature: z.string().min(2, 'Type your name to sign'),
    consent: z.literal(true, {
      errorMap: () => ({ message: 'You must accept to sign electronically' }),
    }),
  })
  // The typed signature is printed on the countersigned contract as the
  // client's mark, so it has to be their name and not arbitrary characters.
  // A drawn signature arrives as a data URL and is exempt.
  .refine(
    (v) => v.signature.startsWith('data:image/') || nameKey(v.signature) === nameKey(v.signerName),
    { path: ['signature'], message: 'Your signature must match the full name you entered.' }
  );

// ---------- Delivery ----------

export const projectSchema = z.object({
  name: z.string().min(2).max(160),
  code: z.string().min(2).max(24).optional(),
  clientId: z.string().min(1, 'Client is required'),
  sowId: z.string().optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'QA', 'DELIVERED', 'CLOSED', 'CANCELLED']).default('PLANNING'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  leadDevId: z.string().optional(),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional(),
  budgetHours: z.string().optional(),
});

export const progressLogSchema = z.object({
  projectId: z.string().min(1),
  logDate: z.string().min(1),
  hoursSpent: z.coerce.number().min(0).max(24),
  summary: z.string().min(5, 'Say what you worked on').max(2000),
  blockers: z.string().max(1000).optional(),
  nextSteps: z.string().max(1000).optional(),
  clientVisible: z.boolean().default(false),
});

export const issueSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(3).max(200),
  description: z.string().max(4000).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  stepsToReproduce: z.string().max(2000).optional(),
  environment: z.string().max(200).optional(),
  assigneeId: z.string().optional(),
});

export const taskSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE', 'CANCELLED']).default('TODO'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  assigneeId: z.string().optional(),
  projectId: z.string().optional(),
  department: z.string().max(40).optional(),
  dueDate: z.string().optional(),
});

// ---------- Vault ----------

export const credentialSchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().max(500).optional(),
  category: z.string().max(60).default('api_key'),
  environment: z.string().max(40).default('production'),
  username: z.string().max(160).optional(),
  url: z.string().max(300).optional(),
  secret: z.string().min(1, 'Secret is required'),
  sensitivity: z.enum(['STANDARD', 'CRITICAL']).default('STANDARD'),
  clientId: z.string().optional(),
  projectId: z.string().optional(),
  expiresAt: z.string().optional(),
});

export const sudoSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

// ---------- Marketing ----------

export const brandSchema = z.object({
  name: z.string().min(2).max(120),
  clientId: z.string().optional(),
  industry: z.string().max(80).optional(),
  website: z.string().url().optional().or(z.literal('')),
  primaryColor: z.string().max(9).optional(),
  secondaryColor: z.string().max(9).optional(),
  notes: z.string().max(1000).optional(),
});

export const campaignSchema = z.object({
  name: z.string().min(2).max(160),
  brandId: z.string().min(1, 'Brand is required'),
  platform: z.enum(['META', 'GOOGLE', 'LINKEDIN', 'YOUTUBE', 'X']).default('META'),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']).default('DRAFT'),
  objective: z.string().max(120).optional(),
  budget: z.string().optional(),
  spend: z.string().optional(),
  revenue: z.string().optional(),
  currency: z.enum(['INR', 'USD']).default('INR'),
  impressions: z.coerce.number().int().min(0).default(0),
  clicks: z.coerce.number().int().min(0).default(0),
  conversions: z.coerce.number().int().min(0).default(0),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// ---------- Admin ----------

export const userSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().max(24).optional(),
  role: z.enum(['SUPER_ADMIN', 'SUB_ADMIN', 'SALES', 'DEVELOPER', 'MARKETING', 'CLIENT']),
  department: z.string().max(60).optional(),
  clientId: z.string().optional(),
  password: z.string().min(8, 'At least 8 characters').optional(),
  status: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED']).default('ACTIVE'),
});

export const expenseSchema = z.object({
  title: z.string().min(2).max(200),
  category: z.enum(['SALARY', 'SOFTWARE', 'AD_SPEND', 'INFRASTRUCTURE', 'CONTRACTOR', 'OFFICE', 'TRAVEL', 'TAX', 'OTHER']),
  amount: amountString,
  currency: z.enum(['INR', 'USD']).default('INR'),
  gstAmount: z.string().optional(),
  itcEligible: z.boolean().default(false),
  vendor: z.string().max(160).optional(),
  expenseDate: z.string().min(1),
  clientId: z.string().optional(),
  projectId: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export const companyProfileSchema = z.object({
  legalName: z.string().min(2).max(200),
  tradeName: z.string().max(160).optional(),
  gstin: z.string().max(15).optional().or(z.literal('')),
  pan: z.string().max(10).optional(),
  cin: z.string().max(21).optional(),
  addressLine1: z.string().min(2).max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(2).max(80),
  stateCode: z.string().length(2, 'Two-digit GST state code'),
  postalCode: z.string().max(12),
  country: z.string().max(60).default('India'),
  email: z.string().email(),
  phone: z.string().max(24),
  website: z.string().url().optional().or(z.literal('')),
  bankName: z.string().max(120).optional(),
  bankAccountName: z.string().max(160).optional(),
  bankAccountNumber: z.string().max(40).optional(),
  bankIfsc: z.string().max(11).optional(),
  bankSwift: z.string().max(11).optional(),
  upiId: z.string().max(80).optional(),
  defaultGstRate: z.coerce.number().min(0).max(100).default(18),
  defaultSacCode: z.string().max(10).default('998314'),
  defaultAmountBasis: z.enum(['EXCLUSIVE', 'INCLUSIVE']).default('EXCLUSIVE'),
  defaultPaymentTermDays: z.coerce.number().int().min(0).max(180).default(15),
  exportUnderLut: z.boolean().default(true),
  defaultTdsRate: z.coerce.number().min(0).max(100).default(10),
  applyTdsByDefault: z.boolean().default(false),
  invoicePrefix: z.string().min(1).max(10).default('XCC'),
  defaultTerms: z.string().max(2000).optional(),
  defaultNotes: z.string().max(2000).optional(),
});
