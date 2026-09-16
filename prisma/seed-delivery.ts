/**
 * Seed part 2 — SOWs, projects, delivery, billing, vault and marketing.
 *
 * Invoices go through the real invoice service so the seeded data exercises the
 * genuine GST paths: intra-state (CGST+SGST), inter-state (IGST) and
 * zero-rated export.
 */

import type { PrismaClient, Client, User } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { createQuickInvoice, applyPayment } from '../src/lib/billing/invoice-service';
import { encryptSecret } from '../src/lib/crypto';
import { generateToken } from '../src/lib/crypto';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000);

interface Ctx {
  superAdmin: User; subAdmin: User; sales: User; sales2: User;
  dev: User; dev2: User; marketing: User; clientUser: User;
  northwind: Client; vertex: Client; meridian: Client;
}

export async function seedDelivery(prisma: PrismaClient, ctx: Ctx) {
  const { superAdmin, subAdmin, sales, dev, dev2, marketing, northwind, vertex, meridian } = ctx;

  // ---------- SOWs ----------
  console.log('   SOWs & signatures…');

  const sow1 = await prisma.sow.create({
    data: {
      number: 'SOW/2026/0001',
      title: 'Northwind Retail — Customer Loyalty Platform',
      clientId: northwind.id,
      status: 'SIGNED',
      scope:
        'Design and build a customer loyalty platform covering points accrual, tier management, ' +
        'reward redemption and a customer-facing mobile web app.\n\n' +
        'Includes integration with the existing POS via its REST API, an admin console for the ' +
        'marketing team, and analytics on redemption behaviour.',
      deliverables:
        '• Loyalty rules engine with configurable tiers\n' +
        '• Customer mobile web app (PWA)\n' +
        '• Admin console for campaign and reward management\n' +
        '• POS integration adapter\n' +
        '• Analytics dashboard\n' +
        '• Documentation and a two-week handover',
      assumptions:
        'POS API documentation and a sandbox environment are provided within one week of kick-off. ' +
        'Brand assets and tone-of-voice guidelines are supplied by the client.',
      outOfScope:
        'Native iOS/Android applications, POS hardware changes, and migration of historical ' +
        'transaction data older than 24 months.',
      timeline: '16 weeks from kick-off, in four milestones.',
      paymentTerms: '30% on signing, 30% at design sign-off, 25% at UAT, 15% on go-live.',
      currency: 'INR',
      value: new Prisma.Decimal(1850000),
      startDate: daysAgo(60),
      endDate: daysAhead(52),
      createdById: sales.id,
      sentAt: daysAgo(66),
      viewedAt: daysAgo(65),
      signedAt: daysAgo(62),
      milestones: {
        create: [
          { title: 'Discovery & design sign-off', percentage: new Prisma.Decimal(30), amount: new Prisma.Decimal(555000), dueDate: daysAgo(40), position: 0 },
          { title: 'Core loyalty engine', percentage: new Prisma.Decimal(30), amount: new Prisma.Decimal(555000), dueDate: daysAgo(10), position: 1 },
          { title: 'UAT completion', percentage: new Prisma.Decimal(25), amount: new Prisma.Decimal(462500), dueDate: daysAhead(25), position: 2 },
          { title: 'Go-live & handover', percentage: new Prisma.Decimal(15), amount: new Prisma.Decimal(277500), dueDate: daysAhead(52), position: 3 },
        ],
      },
    },
  });

  await prisma.sowSignature.create({
    data: {
      sowId: sow1.id,
      signerName: 'Priya Sharma',
      signerEmail: 'client@northwind.test',
      signerTitle: 'Director, Customer Experience',
      ipAddress: '103.21.58.142',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
      signatureData: 'Priya Sharma',
      consentText:
        'I confirm that I am authorised to sign on behalf of the client, that I have read and agree ' +
        'to this Statement of Work, and that this electronic signature is legally binding and has ' +
        'the same effect as a handwritten signature.',
      documentHash: 'a3f1c9e7b24d8065f1a7c3e9d0b4826af5713c9d2e8064b1a7f3c5e9d2b48610',
      signedAt: daysAgo(62),
    },
  });

  const sow2 = await prisma.sow.create({
    data: {
      number: 'SOW/2026/0002',
      title: 'Vertex Fintech — KYC Onboarding Revamp',
      clientId: vertex.id,
      status: 'SENT',
      scope:
        'Rebuild the customer onboarding journey with document capture, automated KYC checks via ' +
        'a third-party verification provider, and a risk-scoring review queue for the compliance team.',
      deliverables:
        '• Onboarding flow with progressive document capture\n' +
        '• KYC provider integration with retry and fallback\n' +
        '• Compliance review queue with audit trail\n' +
        '• Risk scoring rules engine',
      assumptions: 'Vertex provides sandbox credentials for the KYC provider before development starts.',
      outOfScope: 'Changes to the core banking ledger; regulatory filings.',
      timeline: '12 weeks.',
      paymentTerms: '40% advance, 35% at UAT, 25% on go-live.',
      currency: 'INR',
      value: new Prisma.Decimal(2400000),
      startDate: daysAhead(14),
      endDate: daysAhead(98),
      createdById: sales.id,
      sentAt: daysAgo(4),
      viewedAt: daysAgo(3),
      milestones: {
        create: [
          { title: 'Advance on signing', percentage: new Prisma.Decimal(40), amount: new Prisma.Decimal(960000), dueDate: daysAhead(14), position: 0 },
          { title: 'UAT sign-off', percentage: new Prisma.Decimal(35), amount: new Prisma.Decimal(840000), dueDate: daysAhead(70), position: 1 },
          { title: 'Go-live', percentage: new Prisma.Decimal(25), amount: new Prisma.Decimal(600000), dueDate: daysAhead(98), position: 2 },
        ],
      },
    },
  });

  // A live, unexpired share link so /sign/<token> is demonstrable immediately.
  const sowToken = generateToken(24);
  await prisma.shareLink.create({
    data: {
      token: sowToken,
      kind: 'SOW',
      sowId: sow2.id,
      createdById: sales.id,
      expiresAt: daysAhead(26),
      viewCount: 2,
      lastViewedAt: daysAgo(3),
      lastViewedIp: '49.36.180.22',
    },
  });

  // ---------- Projects ----------
  console.log('   Projects, milestones, issues…');

  const project1 = await prisma.project.create({
    data: {
      code: 'NWD-LOYALTY',
      name: 'Northwind Loyalty Platform',
      description: 'Points, tiers, rewards and a customer PWA, integrated with the existing POS.',
      clientId: northwind.id,
      sowId: sow1.id,
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      leadDevId: dev.id,
      startDate: daysAgo(60),
      targetEndDate: daysAhead(52),
      progressPct: 55,
      budgetHours: new Prisma.Decimal(960),
      repoUrl: 'https://github.com/xcc/northwind-loyalty',
      stagingUrl: 'https://staging.northwind-loyalty.xcc.test',
      members: { create: [{ userId: dev.id, roleLabel: 'Tech Lead' }, { userId: dev2.id, roleLabel: 'Frontend' }] },
      milestones: {
        create: [
          { title: 'Discovery & design sign-off', status: 'APPROVED', dueDate: daysAgo(40), completedAt: daysAgo(42), approvedAt: daysAgo(40), position: 0, billableAmount: new Prisma.Decimal(555000) },
          { title: 'Core loyalty engine', status: 'COMPLETED', dueDate: daysAgo(10), completedAt: daysAgo(8), position: 1, billableAmount: new Prisma.Decimal(555000) },
          { title: 'Customer PWA & POS integration', status: 'IN_PROGRESS', dueDate: daysAhead(25), position: 2, billableAmount: new Prisma.Decimal(462500) },
          { title: 'Go-live & handover', status: 'PENDING', dueDate: daysAhead(52), position: 3, billableAmount: new Prisma.Decimal(277500) },
        ],
      },
    },
  });

  const project2 = await prisma.project.create({
    data: {
      code: 'MER-DATA',
      name: 'Meridian Data Pipeline',
      description: 'Event ingestion pipeline and reporting warehouse for Meridian Labs.',
      clientId: meridian.id,
      status: 'QA',
      priority: 'MEDIUM',
      leadDevId: dev2.id,
      startDate: daysAgo(90),
      targetEndDate: daysAhead(12),
      progressPct: 80,
      budgetHours: new Prisma.Decimal(640),
      members: { create: [{ userId: dev2.id, roleLabel: 'Tech Lead' }, { userId: dev.id, roleLabel: 'Backend' }] },
      milestones: {
        create: [
          { title: 'Ingestion service', status: 'APPROVED', dueDate: daysAgo(55), completedAt: daysAgo(57), approvedAt: daysAgo(55), position: 0 },
          { title: 'Warehouse & transforms', status: 'COMPLETED', dueDate: daysAgo(20), completedAt: daysAgo(18), position: 1 },
          { title: 'Reporting layer', status: 'IN_PROGRESS', dueDate: daysAhead(12), position: 2 },
        ],
      },
    },
  });

  const project3 = await prisma.project.create({
    data: {
      code: 'GRN-D2C',
      name: 'GreenLeaf D2C Storefront',
      description: 'Subscription commerce storefront with recurring billing.',
      clientId: northwind.id,
      status: 'PLANNING',
      priority: 'MEDIUM',
      leadDevId: dev.id,
      startDate: daysAhead(7),
      targetEndDate: daysAhead(90),
      progressPct: 5,
      clientVisible: false,
      members: { create: [{ userId: dev.id, roleLabel: 'Tech Lead' }] },
    },
  });

  const issueSeeds = [
    { project: project1.id, key: 'NWD-101', title: 'Points expiry job double-counts rollover tiers', severity: 'HIGH' as const, status: 'IN_PROGRESS' as const, assignee: dev.id, desc: 'Members crossing a tier boundary during the nightly expiry run get their rollover points counted twice.' },
    { project: project1.id, key: 'NWD-102', title: 'PWA push permission prompt fires on first paint', severity: 'MEDIUM' as const, status: 'OPEN' as const, assignee: dev2.id, desc: 'Prompt should be deferred until after the first redemption.' },
    { project: project1.id, key: 'NWD-103', title: 'POS adapter retries exhaust on 429', severity: 'URGENT' as const, status: 'TRIAGED' as const, assignee: dev.id, desc: 'Backoff is linear; needs exponential with jitter to survive POS rate limits.' },
    { project: project2.id, key: 'MER-044', title: 'Timezone drift in daily aggregation', severity: 'HIGH' as const, status: 'RESOLVED' as const, assignee: dev2.id, desc: 'Aggregates bucketed in UTC while the dashboard renders in PT.' },
    { project: project2.id, key: 'MER-045', title: 'Warehouse load fails on null merchant_id', severity: 'MEDIUM' as const, status: 'OPEN' as const, assignee: dev2.id, desc: 'Needs a quarantine table rather than failing the whole batch.' },
  ];

  for (const i of issueSeeds) {
    await prisma.issue.create({
      data: {
        projectId: i.project, key: i.key, title: i.title, description: i.desc,
        severity: i.severity, status: i.status,
        reporterId: subAdmin.id, assigneeId: i.assignee,
        environment: 'staging',
        resolvedAt: i.status === 'RESOLVED' ? daysAgo(3) : null,
      },
    });
  }

  const logSeeds = [
    { project: project1.id, author: dev.id, day: 1, hours: 7.5, summary: 'Reworked the points expiry job to process tier transitions in a single pass.', blockers: 'Waiting on the POS sandbox rate limits being raised.', next: 'Add exponential backoff to the POS adapter.', visible: true },
    { project: project1.id, author: dev2.id, day: 1, hours: 6, summary: 'Built the reward redemption screen and wired it to the loyalty API.', next: 'Offline support for the PWA.', visible: true },
    { project: project1.id, author: dev.id, day: 2, hours: 8, summary: 'POS adapter integration tests green against the sandbox.', visible: true },
    { project: project2.id, author: dev2.id, day: 1, hours: 7, summary: 'Fixed the timezone bucketing in daily aggregates and backfilled 90 days.', visible: true },
    { project: project2.id, author: dev2.id, day: 3, hours: 5.5, summary: 'Reporting layer query performance tuning — p95 down from 4.2s to 600ms.', visible: false },
  ];

  for (const l of logSeeds) {
    const logDate = daysAgo(l.day);
    logDate.setHours(0, 0, 0, 0);
    await prisma.progressLog.create({
      data: {
        projectId: l.project, authorId: l.author, logDate,
        hoursSpent: new Prisma.Decimal(l.hours),
        summary: l.summary, blockers: l.blockers, nextSteps: l.next,
        clientVisible: l.visible,
      },
    });
  }

  const taskSeeds = [
    { title: 'Prepare Q1 revenue forecast', assignee: subAdmin.id, creator: superAdmin.id, priority: 'HIGH' as const, status: 'IN_PROGRESS' as const, dept: 'finance', due: daysAhead(3) },
    { title: 'Follow up on Vertex SOW signature', assignee: sales.id, creator: subAdmin.id, priority: 'URGENT' as const, status: 'TODO' as const, dept: 'sales', due: daysAhead(1) },
    { title: 'Ship POS adapter backoff fix', assignee: dev.id, creator: subAdmin.id, priority: 'URGENT' as const, status: 'IN_PROGRESS' as const, dept: 'dev', project: project1.id, due: daysAhead(2) },
    { title: 'PWA offline cache strategy', assignee: dev2.id, creator: dev.id, priority: 'MEDIUM' as const, status: 'TODO' as const, dept: 'dev', project: project1.id, due: daysAhead(6) },
    { title: 'Refresh Meta creative set for GreenLeaf', assignee: marketing.id, creator: subAdmin.id, priority: 'MEDIUM' as const, status: 'REVIEW' as const, dept: 'marketing', due: daysAhead(4) },
    { title: 'Reconcile November payment gateway settlements', assignee: subAdmin.id, creator: superAdmin.id, priority: 'MEDIUM' as const, status: 'DONE' as const, dept: 'finance', due: daysAgo(5) },
    { title: 'Rotate staging database credentials', assignee: dev.id, creator: superAdmin.id, priority: 'LOW' as const, status: 'TODO' as const, dept: 'dev', due: daysAhead(14) },
  ];

  for (const t of taskSeeds) {
    await prisma.task.create({
      data: {
        title: t.title, assigneeId: t.assignee, createdById: t.creator,
        priority: t.priority, status: t.status, department: t.dept,
        projectId: t.project, dueDate: t.due,
        completedAt: t.status === 'DONE' ? daysAgo(5) : null,
      },
    });
  }

  // ---------- Invoices (through the real service) ----------
  console.log('   Invoices — intra-state, inter-state and export…');

  const actor = { id: superAdmin.id, email: superAdmin.email, role: 'SUPER_ADMIN' as const };

  // 1. Intra-state (Maharashtra → Maharashtra): CGST + SGST
  const inv1 = await createQuickInvoice(
    {
      clientId: northwind.id,
      amount: '555000',
      description: 'Loyalty platform — Milestone 1: Discovery & design sign-off',
      sowId: sow1.id,
      issueDate: daysAgo(45),
      dueDate: daysAgo(30),
    },
    actor
  );
  await prisma.invoice.update({
    where: { id: inv1.invoice.id },
    data: { status: 'SENT', isLocked: true, sentAt: daysAgo(45) },
  });
  await applyPayment({
    invoiceId: inv1.invoice.id,
    amount: inv1.invoice.total.toString(),
    method: 'BANK_TRANSFER',
    reference: 'UTR2026031100451',
    paidAt: daysAgo(33),
    recordedById: subAdmin.id,
  });

  // 2. Intra-state, partially paid
  const inv2 = await createQuickInvoice(
    {
      clientId: northwind.id,
      amount: '555000',
      description: 'Loyalty platform — Milestone 2: Core loyalty engine',
      sowId: sow1.id,
      issueDate: daysAgo(12),
    },
    actor
  );
  await prisma.invoice.update({
    where: { id: inv2.invoice.id },
    data: { status: 'SENT', isLocked: true, sentAt: daysAgo(12) },
  });
  await applyPayment({
    invoiceId: inv2.invoice.id,
    amount: '300000',
    method: 'UPI',
    reference: 'UPI-4471209934',
    paidAt: daysAgo(5),
    recordedById: subAdmin.id,
  });

  // 3. Inter-state (Maharashtra → Karnataka) with TDS: IGST
  const inv3 = await createQuickInvoice(
    {
      clientId: vertex.id,
      amount: '480000',
      description: 'KYC onboarding revamp — advance against SOW/2026/0002',
      issueDate: daysAgo(20),
    },
    actor
  );
  await prisma.invoice.update({
    where: { id: inv3.invoice.id },
    data: { status: 'OVERDUE', isLocked: true, sentAt: daysAgo(20) },
  });

  // 4. Export to the US: zero-rated under LUT, billed in USD
  const inv4 = await createQuickInvoice(
    {
      clientId: meridian.id,
      amount: '14500',
      currency: 'USD',
      description: 'Data pipeline engineering — sprint 11 & 12',
      projectId: project2.id,
      issueDate: daysAgo(8),
    },
    actor
  );
  await prisma.invoice.update({
    where: { id: inv4.invoice.id },
    data: { status: 'SENT', isLocked: true, sentAt: daysAgo(8) },
  });

  // 5. A live draft, ready to demo the Approve & Send flow
  await createQuickInvoice(
    {
      clientId: northwind.id,
      amount: '125000',
      description: 'Additional scope — analytics dashboard enhancements',
    },
    actor
  );

  // Retainer schedule
  await prisma.recurringInvoice.create({
    data: {
      clientId: northwind.id,
      title: 'Monthly marketing retainer',
      amount: new Prisma.Decimal(85000),
      currency: 'INR',
      interval: 'MONTHLY',
      dayOfMonth: 1,
      startDate: daysAgo(90),
      nextRunAt: daysAhead(5),
      lastRunAt: daysAgo(25),
      autoSend: false,
      sacCode: '998365',
      notes: 'Social media management, paid campaign management and monthly reporting.',
    },
  });

  // ---------- Expenses ----------
  console.log('   Expenses…');
  const expenseSeeds = [
    { title: 'AWS — production & staging', category: 'INFRASTRUCTURE' as const, amount: '68400', gst: '10440', itc: true, vendor: 'Amazon Web Services', days: 6, status: 'APPROVED' as const, project: project1.id },
    { title: 'Meta Ads — GreenLeaf campaign', category: 'AD_SPEND' as const, amount: '145000', gst: '0', itc: false, vendor: 'Meta Platforms', days: 10, status: 'APPROVED' as const },
    { title: 'Figma & Linear annual seats', category: 'SOFTWARE' as const, amount: '92000', gst: '16560', itc: true, vendor: 'Figma / Linear', days: 22, status: 'REIMBURSED' as const },
    { title: 'Contract QA engineer — November', category: 'CONTRACTOR' as const, amount: '120000', gst: '21600', itc: true, vendor: 'Rhea Consulting', days: 14, status: 'APPROVED' as const, project: project2.id },
    { title: 'Client visit — Bengaluru', category: 'TRAVEL' as const, amount: '18500', gst: '925', itc: false, vendor: 'IndiGo / Taj', days: 3, status: 'SUBMITTED' as const },
  ];

  for (const e of expenseSeeds) {
    await prisma.expense.create({
      data: {
        title: e.title, category: e.category,
        amount: new Prisma.Decimal(e.amount),
        gstAmount: new Prisma.Decimal(e.gst),
        itcEligible: e.itc, vendor: e.vendor,
        expenseDate: daysAgo(e.days), status: e.status,
        ownerId: subAdmin.id,
        approverId: e.status === 'SUBMITTED' ? null : superAdmin.id,
        approvedAt: e.status === 'SUBMITTED' ? null : daysAgo(e.days - 1),
        projectId: e.project,
      },
    });
  }

  // ---------- Vault ----------
  console.log('   Credentials vault (AES-256-GCM)…');
  const credentialSeeds = [
    { name: 'Razorpay — Production', category: 'payment_gateway', env: 'production', secret: 'EXAMPLE-ONLY-razorpay-secret', sensitivity: 'CRITICAL' as const, username: 'EXAMPLE-ONLY-razorpay-key-id', url: 'https://dashboard.razorpay.com' },
    { name: 'Stripe — Production', category: 'payment_gateway', env: 'production', secret: 'EXAMPLE-ONLY-stripe-secret', sensitivity: 'CRITICAL' as const, url: 'https://dashboard.stripe.com' },
    { name: 'SendGrid API key', category: 'email', env: 'production', secret: 'EXAMPLE-ONLY-sendgrid-key', sensitivity: 'CRITICAL' as const },
    { name: 'Northwind POS — Sandbox', category: 'api_key', env: 'staging', secret: 'nw_sandbox_7f3a9c1e5b2d', sensitivity: 'STANDARD' as const, username: 'xcc_integration', clientId: null as string | null },
    { name: 'Staging database URL', category: 'database', env: 'staging', secret: 'postgresql://app:stagingpw@db.staging.internal:5432/xcc', sensitivity: 'STANDARD' as const },
    { name: 'Meta Business — System user token', category: 'marketing', env: 'production', secret: 'EXAMPLE-ONLY-meta-token', sensitivity: 'CRITICAL' as const },
    { name: 'Cloudflare R2 — Assets bucket', category: 'storage', env: 'production', secret: 'r2_seeded_fake_access_secret_key', sensitivity: 'STANDARD' as const },
  ];

  const credentials = [];
  for (const c of credentialSeeds) {
    const enc = encryptSecret(c.secret);
    credentials.push(
      await prisma.credential.create({
        data: {
          name: c.name, category: c.category, environment: c.env,
          username: c.username, url: c.url,
          sensitivity: c.sensitivity,
          secretCiphertext: enc.ciphertext,
          secretIv: enc.iv,
          secretAuthTag: enc.authTag,
          keyVersion: enc.keyVersion,
          ownerId: superAdmin.id,
          description: `Seeded demo credential — ${c.category}`,
        },
      })
    );
  }

  // A developer granted access to exactly one staging credential.
  const stagingDb = credentials.find((c) => c.name === 'Staging database URL')!;
  await prisma.permissionGrant.create({
    data: {
      userId: dev.id,
      resource: 'credential',
      resourceId: stagingDb.id,
      action: 'reveal',
      grantedById: superAdmin.id,
    },
  });

  await prisma.credentialAccess.create({
    data: {
      credentialId: stagingDb.id, userId: dev.id, action: 'reveal',
      ip: '10.2.1.44', sudoVerified: false, createdAt: daysAgo(2),
    },
  });

  // ---------- Marketing ----------
  console.log('   Brands, campaigns, ad creatives…');

  const brand1 = await prisma.brand.create({
    data: {
      name: 'GreenLeaf Organics', clientId: northwind.id, ownerId: marketing.id,
      industry: 'D2C / Food & Beverage', website: 'https://greenleaf.test',
      primaryColor: '#2F855A', secondaryColor: '#9AE6B4',
      notes: 'Warm, earthy tone. Avoid clinical health claims.',
    },
  });

  const brand2 = await prisma.brand.create({
    data: {
      name: 'Vertex Fintech', clientId: vertex.id, ownerId: marketing.id,
      industry: 'Financial Services', website: 'https://vertexfin.test',
      primaryColor: '#1A365D', secondaryColor: '#4299E1',
      notes: 'Compliance review required on every creative before it goes live.',
    },
  });

  const campaignSeeds = [
    { name: 'GreenLeaf — Festive Subscription Push', brand: brand1.id, platform: 'META' as const, status: 'ACTIVE' as const, objective: 'Conversions', budget: '250000', spend: '182400', revenue: '612000', impressions: 1_840_000, clicks: 42_300, conversions: 1_210, leads: 340, start: daysAgo(28) },
    { name: 'GreenLeaf — Search Brand Defence', brand: brand1.id, platform: 'GOOGLE' as const, status: 'ACTIVE' as const, objective: 'Traffic', budget: '90000', spend: '61200', revenue: '148000', impressions: 310_000, clicks: 18_900, conversions: 420, leads: 96, start: daysAgo(35) },
    { name: 'Vertex — SME Lending Awareness', brand: brand2.id, platform: 'LINKEDIN' as const, status: 'ACTIVE' as const, objective: 'Lead generation', budget: '400000', spend: '218000', revenue: '390000', impressions: 720_000, clicks: 9_800, conversions: 186, leads: 142, start: daysAgo(21) },
    { name: 'Vertex — Retargeting Q4', brand: brand2.id, platform: 'META' as const, status: 'PAUSED' as const, objective: 'Conversions', budget: '150000', spend: '148900', revenue: '205000', impressions: 640_000, clicks: 12_100, conversions: 310, leads: 58, start: daysAgo(60) },
  ];

  const campaigns = [];
  for (const c of campaignSeeds) {
    campaigns.push(
      await prisma.campaign.create({
        data: {
          name: c.name, brandId: c.brand, platform: c.platform, status: c.status,
          objective: c.objective,
          budget: new Prisma.Decimal(c.budget),
          spend: new Prisma.Decimal(c.spend),
          revenue: new Prisma.Decimal(c.revenue),
          currency: 'INR',
          impressions: c.impressions, clicks: c.clicks,
          conversions: c.conversions, leadsCount: c.leads,
          startDate: c.start, endDate: daysAhead(30),
          lastSyncedAt: daysAgo(1),
        },
      })
    );
  }

  const creativeSeeds = [
    { name: 'Festive Hamper — Feed 1:1', brand: brand1.id, campaign: campaigns[0].id, platform: 'META' as const, format: 'feed', status: 'LIVE' as const, headline: 'Organic hampers, delivered fresh', primary: 'Hand-picked produce from certified organic farms. Subscribe this festive season and save 20% on your first three boxes.', cta: 'Shop Now' },
    { name: 'Festive Hamper — Story 9:16', brand: brand1.id, campaign: campaigns[0].id, platform: 'META' as const, format: 'story', status: 'LIVE' as const, headline: '20% off your first 3 boxes', primary: 'Fresh, organic, and at your door every week.', cta: 'Subscribe' },
    { name: 'Brand Search — RSA headlines', brand: brand1.id, campaign: campaigns[1].id, platform: 'GOOGLE' as const, format: 'search', status: 'APPROVED' as const, headline: 'GreenLeaf Organics — Official Store', primary: 'Certified organic produce. Free delivery over ₹999.', cta: 'Visit Site' },
    { name: 'SME Lending — Sponsored Content', brand: brand2.id, campaign: campaigns[2].id, platform: 'LINKEDIN' as const, format: 'feed', status: 'LIVE' as const, headline: 'Working capital in 48 hours', primary: 'Vertex gives growing businesses a credit line without the paperwork marathon. Regulated and RBI-compliant.', cta: 'Learn More' },
    { name: 'SME Lending — Variant B', brand: brand2.id, campaign: campaigns[2].id, platform: 'LINKEDIN' as const, format: 'feed', status: 'PENDING_REVIEW' as const, headline: 'Credit that moves at your speed', primary: 'Apply in ten minutes. Decisions in two days. No collateral for lines under ₹50L.', cta: 'Apply Now' },
    { name: 'Retargeting — Carousel', brand: brand2.id, campaign: campaigns[3].id, platform: 'META' as const, format: 'feed', status: 'PENDING_REVIEW' as const, headline: 'Still thinking it over?', primary: 'Your application is saved. Pick up where you left off.', cta: 'Continue' },
  ];

  for (const c of creativeSeeds) {
    await prisma.creative.create({
      data: {
        name: c.name, brandId: c.brand, campaignId: c.campaign,
        platform: c.platform, format: c.format, status: c.status,
        headline: c.headline, primaryText: c.primary,
        ctaLabel: c.cta, destinationUrl: 'https://example.test/landing',
        reviewerId: c.status === 'APPROVED' || c.status === 'LIVE' ? marketing.id : null,
        reviewedAt: c.status === 'APPROVED' || c.status === 'LIVE' ? daysAgo(5) : null,
      },
    });
  }

  // Attribute a couple of leads to paid campaigns so marketing→CRM sync is visible.
  const paidLeads = await prisma.lead.findMany({
    where: { source: { in: ['META_ADS', 'GOOGLE_ADS'] } },
    select: { id: true, source: true },
  });
  for (const lead of paidLeads) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        campaignId: lead.source === 'META_ADS' ? campaigns[0].id : campaigns[1].id,
        externalId: `lead_${lead.id.slice(-8)}`,
      },
    });
  }

  // ---------- Notifications ----------
  console.log('   Notifications…');
  await prisma.notification.createMany({
    data: [
      { userId: superAdmin.id, type: 'PAYMENT_RECEIVED', title: 'Payment received — XCC/26-27/0001', body: '₹6,54,900 from Northwind Retail.', linkUrl: '/invoices', isRead: false },
      { userId: superAdmin.id, type: 'INVOICE_OVERDUE', title: 'Invoice overdue', body: 'Vertex Fintech invoice is past its due date.', linkUrl: '/invoices?status=OVERDUE', isRead: false },
      { userId: subAdmin.id, type: 'SOW_VIEWED', title: 'SOW/2026/0002 was opened', body: 'Vertex Fintech viewed the statement of work.', linkUrl: '/sows', isRead: false },
      { userId: sales.id, type: 'FOLLOWUP_OVERDUE', title: '2 overdue follow-ups', body: 'Discovery call — fleet tracking scope, and 1 more.', linkUrl: '/follow-ups', isRead: false },
      { userId: dev.id, type: 'TASK_ASSIGNED', title: 'Task assigned: Ship POS adapter backoff fix', linkUrl: '/tasks', isRead: false },
      { userId: marketing.id, type: 'SYSTEM', title: '2 creatives awaiting approval', linkUrl: '/marketing/studio', isRead: false },
    ],
  });

  console.log(`\n   ✓ 2 SOWs (1 signed), 3 projects, ${issueSeeds.length} issues, 5 invoices`);
  console.log(`   ✓ ${credentials.length} vault secrets, ${campaigns.length} campaigns, ${creativeSeeds.length} creatives`);
  console.log(`\n   🔗 Live SOW signing link:  /sign/${sowToken}`);
}
