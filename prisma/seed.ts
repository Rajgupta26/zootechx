/**
 * Seed script — realistic demo data across all six roles.
 *
 * Run with: npm run db:seed
 * Every account uses the password `password123`.
 *
 * Invoices are created through the real billing service rather than raw
 * inserts, so the seeded data exercises the same GST logic, numbering and
 * dispatch paths as production.
 */

import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
// Reuse the application's Prisma singleton. The seed calls into the real
// billing service, which uses this same client — creating a second one here
// would open a second connection pool and split transaction boundaries.
import { prisma } from '../src/lib/db';

const PASSWORD = 'password123';
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000);

// Vault encryption needs a key; generate an ephemeral one if none is set so the
// seed never fails on a fresh checkout.
if (!process.env.VAULT_MASTER_KEY) {
  process.env.VAULT_MASTER_KEY = randomBytes(32).toString('base64');
  console.warn(
    '⚠  VAULT_MASTER_KEY was not set — using a throwaway key for this seed.\n' +
      '   Set a real one in .env or seeded credentials will not decrypt later.'
  );
}

async function main() {
  console.log('🌱 Seeding XCC CRM…\n');

  // ---------- Reset ----------
  console.log('   Clearing existing data…');
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.outboundMessage.deleteMany(),
    prisma.webhookEvent.deleteMany(),
    prisma.credentialAccess.deleteMany(),
    prisma.credential.deleteMany(),
    prisma.creative.deleteMany(),
    prisma.campaign.deleteMany(),
    prisma.brand.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.shareLink.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.recurringInvoice.deleteMany(),
    prisma.invoiceSequence.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.task.deleteMany(),
    prisma.issue.deleteMany(),
    prisma.progressLog.deleteMany(),
    prisma.milestone.deleteMany(),
    prisma.projectMember.deleteMany(),
    prisma.project.deleteMany(),
    prisma.sowSignature.deleteMany(),
    prisma.sowMilestone.deleteMany(),
    prisma.sow.deleteMany(),
    prisma.quotationItem.deleteMany(),
    prisma.quotation.deleteMany(),
    prisma.followUp.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.clientContact.deleteMany(),
    prisma.permissionGrant.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
    prisma.client.deleteMany(),
    prisma.companyProfile.deleteMany(),
  ]);

  // ---------- Company profile ----------
  console.log('   Company profile…');
  await prisma.companyProfile.create({
    data: {
      id: 'default',
      legalName: 'XCC Technologies Private Limited',
      tradeName: 'XCC',
      gstin: '27AABCX1234M1Z5',
      pan: 'AABCX1234M',
      cin: 'U72900MH2019PTC123456',
      addressLine1: '4th Floor, Prime Square',
      addressLine2: 'Andheri East',
      city: 'Mumbai',
      stateCode: '27',
      stateName: 'Maharashtra',
      postalCode: '400069',
      country: 'India',
      email: 'billing@xcc.test',
      phone: '+91 22 4000 1200',
      website: 'https://xcc.test',
      bankName: 'HDFC Bank',
      bankAccountName: 'XCC Technologies Private Limited',
      bankAccountNumber: '50200012345678',
      bankIfsc: 'HDFC0001234',
      bankSwift: 'HDFCINBB',
      upiId: 'xcc@hdfcbank',
      defaultGstRate: new Prisma.Decimal(18),
      defaultSacCode: '998314',
      defaultAmountBasis: 'EXCLUSIVE',
      defaultPaymentTermDays: 15,
      exportUnderLut: true,
      defaultTdsRate: new Prisma.Decimal(10),
      applyTdsByDefault: false,
      invoicePrefix: 'XCC',
      defaultTerms:
        'Payment due within 15 days of invoice date. Interest @18% p.a. applies to overdue amounts. ' +
        'All disputes subject to Mumbai jurisdiction.',
      defaultNotes: 'Thank you for your business.',
    },
  });

  // ---------- Clients ----------
  console.log('   Clients…');
  const hash = await bcrypt.hash(PASSWORD, 12);

  const northwind = await prisma.client.create({
    data: {
      name: 'Northwind Retail',
      legalName: 'Northwind Retail Private Limited',
      gstin: '27AACCN9876P1Z2',
      pan: 'AACCN9876P',
      email: 'accounts@northwind.test',
      phone: '+91 98200 11223',
      website: 'https://northwind.test',
      addressLine1: 'Unit 12, Lotus Business Park',
      city: 'Mumbai',
      stateCode: '27', // same state as XCC → CGST + SGST
      stateName: 'Maharashtra',
      postalCode: '400076',
      currency: 'INR',
      paymentTermDays: 15,
      notes: 'Long-standing retainer client. Prefers WhatsApp for invoice delivery.',
    },
  });

  const vertex = await prisma.client.create({
    data: {
      name: 'Vertex Fintech',
      legalName: 'Vertex Fintech Solutions Pvt Ltd',
      gstin: '29AAECV4567Q1Z8',
      pan: 'AAECV4567Q',
      email: 'finance@vertexfin.test',
      phone: '+91 99000 44556',
      addressLine1: '7th Floor, Prestige Tech Park',
      city: 'Bengaluru',
      stateCode: '29', // different state → IGST
      stateName: 'Karnataka',
      postalCode: '560103',
      currency: 'INR',
      paymentTermDays: 30,
      applyTds: true, // deducts TDS u/s 194J
      tdsRate: new Prisma.Decimal(10),
      notes: 'Enterprise client. Deducts TDS; expect receipts 10% under invoice value.',
    },
  });

  const meridian = await prisma.client.create({
    data: {
      name: 'Meridian Labs',
      legalName: 'Meridian Labs LLC',
      email: 'ap@meridianlabs.test',
      phone: '+1 415 555 0142',
      addressLine1: '2100 Market Street, Suite 400',
      city: 'San Francisco',
      postalCode: '94114',
      country: 'United States', // export → zero-rated under LUT
      currency: 'USD',
      paymentTermDays: 30,
      notes: 'US client. Invoices are zero-rated exports under our LUT; billed in USD via Stripe.',
    },
  });

  const clients = [northwind, vertex, meridian];

  // ---------- Users ----------
  console.log('   Users (6 roles)…');
  const superAdmin = await prisma.user.create({
    data: { name: 'Binoli Shah', email: 'admin@xcc.test', passwordHash: hash, role: 'SUPER_ADMIN', phone: '+91 98111 00001', department: 'Leadership' },
  });
  const subAdmin = await prisma.user.create({
    data: { name: 'Aryan', email: 'ops@xcc.test', passwordHash: hash, role: 'SUB_ADMIN', phone: '+91 98111 00002', department: 'Operations' },
  });
  const sales = await prisma.user.create({
    data: { name: 'Rohit', email: 'sales@xcc.test', passwordHash: hash, role: 'SALES', phone: '+91 98111 00003', department: 'Sales' },
  });
  const sales2 = await prisma.user.create({
    data: { name: 'Divya Nair', email: 'sales2@xcc.test', passwordHash: hash, role: 'SALES', phone: '+91 98111 00006', department: 'Sales' },
  });
  const dev = await prisma.user.create({
    data: { name: 'Raj Gupta', email: 'dev@xcc.test', passwordHash: hash, role: 'DEVELOPER', phone: '+91 98111 00004', department: 'Engineering' },
  });
  const dev2 = await prisma.user.create({
    data: { name: 'Ananya Rao', email: 'dev2@xcc.test', passwordHash: hash, role: 'DEVELOPER', phone: '+91 98111 00007', department: 'Engineering' },
  });
  const marketing = await prisma.user.create({
    data: { name: 'Vishit', email: 'marketing@xcc.test', passwordHash: hash, role: 'MARKETING', phone: '+91 98111 00005', department: 'Marketing' },
  });
  const clientUser = await prisma.user.create({
    data: {
      name: 'Priya Sharma', email: 'client@northwind.test', passwordHash: hash,
      role: 'CLIENT', phone: '+91 98200 11223', clientId: northwind.id,
    },
  });
  await prisma.user.create({
    data: {
      name: 'Rahul Desai', email: 'client@vertexfin.test', passwordHash: hash,
      role: 'CLIENT', phone: '+91 99000 44556', clientId: vertex.id,
    },
  });

  await prisma.client.update({ where: { id: northwind.id }, data: { accountManagerId: sales.id } });
  await prisma.client.update({ where: { id: vertex.id }, data: { accountManagerId: sales.id } });
  await prisma.client.update({ where: { id: meridian.id }, data: { accountManagerId: sales2.id } });

  // ---------- Leads ----------
  console.log('   Leads & follow-ups…');
  const leadSeeds = [
    { name: 'Aditya Rane', company: 'Bluewave Logistics', email: 'aditya@bluewave.test', phone: '+919820100001', source: 'WEBSITE' as const, status: 'QUALIFIED' as const, value: '450000', owner: sales.id, city: 'Pune', stateCode: '27', requirement: 'Fleet tracking dashboard with driver app.' },
    { name: 'Meera Joshi', company: 'Craftly Studio', email: 'meera@craftly.test', phone: '+919820100002', source: 'REFERRAL' as const, status: 'PROPOSAL_SENT' as const, value: '280000', owner: sales.id, city: 'Mumbai', stateCode: '27', requirement: 'E-commerce replatform on Shopify Plus.' },
    { name: 'Vikram Shah', company: 'Orbit Health', email: 'vikram@orbithealth.test', phone: '+919820100003', source: 'META_ADS' as const, status: 'NEW' as const, value: '620000', owner: sales.id, city: 'Ahmedabad', stateCode: '24', requirement: 'Patient intake portal with HIPAA-style audit trail.' },
    { name: 'Sneha Pillai', company: 'Aurora Interiors', email: 'sneha@aurora.test', phone: '+919820100004', source: 'GOOGLE_ADS' as const, status: 'CONTACTED' as const, value: '150000', owner: sales2.id, city: 'Kochi', stateCode: '32', requirement: 'Brand site plus lead-gen landing pages.' },
    { name: 'Farhan Qureshi', company: 'Stacksmith', email: 'farhan@stacksmith.test', phone: '+919820100005', source: 'LINKEDIN' as const, status: 'NEGOTIATION' as const, value: '890000', owner: sales.id, city: 'Bengaluru', stateCode: '29', requirement: 'Internal ops tooling, 6-month engagement.' },
    { name: 'Ritu Malhotra', company: 'GreenLeaf Organics', email: 'ritu@greenleaf.test', phone: '+919820100006', source: 'EVENT' as const, status: 'WON' as const, value: '320000', owner: sales.id, city: 'Delhi', stateCode: '07', requirement: 'D2C storefront and subscription billing.' },
    { name: 'Nikhil Bose', company: 'Trailhead Travel', email: 'nikhil@trailhead.test', phone: '+919820100007', source: 'COLD_OUTREACH' as const, status: 'LOST' as const, value: '210000', owner: sales2.id, city: 'Kolkata', stateCode: '19', requirement: 'Booking engine — went with an off-the-shelf tool.' },
    { name: 'Kavya Reddy', company: 'Lumen Analytics', email: 'kavya@lumen.test', phone: '+919820100008', source: 'WEBSITE' as const, status: 'QUALIFIED' as const, value: '540000', owner: sales2.id, city: 'Hyderabad', stateCode: '36', requirement: 'BI dashboard with role-based access.' },
    { name: 'Imran Khan', company: 'Nimbus Cloud', email: 'imran@nimbus.test', phone: '+919820100009', source: 'WHATSAPP' as const, status: 'CONTACTED' as const, value: '175000', owner: sales.id, city: 'Mumbai', stateCode: '27', requirement: 'Marketing site refresh.' },
    { name: 'Tara Menon', company: 'Palette Design Co', email: 'tara@palette.test', phone: '+919820100010', source: 'REFERRAL' as const, status: 'DORMANT' as const, value: '95000', owner: sales2.id, city: 'Chennai', stateCode: '33', requirement: 'Went quiet after the first call.' },
  ];

  const leads = [];
  for (const [i, s] of leadSeeds.entries()) {
    leads.push(
      await prisma.lead.create({
        data: {
          name: s.name, company: s.company, email: s.email, phone: s.phone,
          dedupeEmail: s.email.toLowerCase(),
          dedupePhone: s.phone.replace(/\D/g, '').slice(-10),
          source: s.source, status: s.status,
          estimatedValue: new Prisma.Decimal(s.value),
          currency: 'INR',
          requirement: s.requirement,
          city: s.city, stateCode: s.stateCode,
          ownerId: s.owner, createdById: s.owner,
          score: 40 + ((i * 7) % 60),
          lastContactedAt: daysAgo(i + 1),
          nextFollowUpAt: s.status === 'WON' || s.status === 'LOST' ? null : daysAhead(i - 3),
          createdAt: daysAgo(30 - i * 2),
          convertedClientId: s.status === 'WON' ? northwind.id : null,
          convertedAt: s.status === 'WON' ? daysAgo(12) : null,
          lostReason: s.status === 'LOST' ? 'Chose an off-the-shelf product' : null,
        },
      })
    );
  }

  const followUpSeeds = [
    { lead: 0, channel: 'CALL' as const, subject: 'Discovery call — fleet tracking scope', due: daysAgo(2), assignee: sales.id, status: 'PENDING' as const },
    { lead: 1, channel: 'EMAIL' as const, subject: 'Share revised proposal with milestone split', due: daysAgo(1), assignee: sales.id, status: 'PENDING' as const },
    { lead: 2, channel: 'WHATSAPP' as const, subject: 'Introduce ourselves and qualify budget', due: daysAhead(1), assignee: sales.id, status: 'PENDING' as const },
    { lead: 4, channel: 'MEETING' as const, subject: 'Commercials walkthrough with their CTO', due: daysAhead(2), assignee: sales.id, status: 'PENDING' as const },
    { lead: 3, channel: 'EMAIL' as const, subject: 'Send case studies for interiors sector', due: daysAhead(4), assignee: sales2.id, status: 'PENDING' as const },
    { lead: 7, channel: 'CALL' as const, subject: 'Technical deep-dive on data sources', due: daysAhead(5), assignee: sales2.id, status: 'PENDING' as const },
    { lead: 5, channel: 'CALL' as const, subject: 'Kick-off scheduling', due: daysAgo(10), assignee: sales.id, status: 'DONE' as const },
    { lead: 8, channel: 'WHATSAPP' as const, subject: 'Follow up on site refresh brief', due: daysAgo(4), assignee: sales.id, status: 'MISSED' as const },
  ];

  for (const f of followUpSeeds) {
    await prisma.followUp.create({
      data: {
        leadId: leads[f.lead].id,
        channel: f.channel,
        subject: f.subject,
        dueAt: f.due,
        assigneeId: f.assignee,
        status: f.status,
        completedAt: f.status === 'DONE' ? f.due : null,
        outcome: f.status === 'DONE' ? 'Kick-off booked for next Monday.' : null,
      },
    });
  }

  console.log(`   ✓ ${leads.length} leads, ${followUpSeeds.length} follow-ups`);
  return { superAdmin, subAdmin, sales, sales2, dev, dev2, marketing, clientUser, clients, northwind, vertex, meridian, leads };
}

main()
  .then(async (ctx) => {
    const { seedDelivery } = await import('./seed-delivery');
    await seedDelivery(prisma, ctx);
  })
  .then(() => {
    console.log('\n✅ Seed complete.\n');
    console.log('   Sign in at http://localhost:3000/login with password: password123');
    console.log('   ┌──────────────────────────┬────────────────────┐');
    console.log('   │ admin@xcc.test           │ Super Admin        │');
    console.log('   │ ops@xcc.test             │ Sub Admin          │');
    console.log('   │ sales@xcc.test           │ Sales              │');
    console.log('   │ dev@xcc.test             │ Developer          │');
    console.log('   │ marketing@xcc.test       │ Digital Marketing  │');
    console.log('   │ client@northwind.test    │ Client portal      │');
    console.log('   └──────────────────────────┴────────────────────┘\n');
  })
  .catch((e) => {
    console.error('\n❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
