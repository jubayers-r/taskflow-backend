import { afterAll, expect, it } from 'vitest';

import { describeIntegration } from '@/__tests__/helpers/integration';
import { prisma } from '@/lib/prisma';
import { registerUser } from '@/modules/auth/auth.repository';

const createdEmails: string[] = [];

const uniqueEmail = (label: string) =>
  `register-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

const input = (email: string, firstName = 'Ada') => ({
  email,
  passwordHash: '$2b$04$notarealhashnotarealhashnotarealhashnotarealhashnotar',
  firstName,
  lastName: 'Lovelace',
  gender: 'FEMALE' as const,
  isAgreeWithTerms: true,
  termsAgreedAt: new Date(),
});

const register = (label: string, firstName?: string) => {
  const email = uniqueEmail(label);
  createdEmails.push(email);
  return registerUser(input(email, firstName));
};

describeIntegration('registerUser', () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await prisma.$disconnect();
  });

  it('creates the account without provisioning an agency', async () => {
    const agenciesBefore = await prisma.agency.count();

    const user = await register('no-agency');

    expect(user.agencyId).toBeNull();
    expect(user.role).toBe('MEMBER');
    expect(await prisma.agency.count()).toBe(agenciesBefore);
  });

  it('never writes a client-supplied tenant id to the user row', async () => {
    // The repository takes no tenancy parameter, so there is no path through
    // which an attacker-chosen agencyId could reach the created row.
    const user = await register('injection');

    expect(user.agencyId).toBeNull();

    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { agencyId: true },
    });
    expect(row?.agencyId).toBeNull();
  });

  it('updates the profile in place on re-register and keeps existing tenancy', async () => {
    const first = await register('repeat');

    // Simulate an agency attached after registration (outside this flow).
    const agency = await prisma.agency.create({ data: { name: 'Repeat Studio' } });
    await prisma.user.update({ where: { id: first.id }, data: { agencyId: agency.id } });

    const agenciesAfterFirst = await prisma.agency.count();
    const second = await registerUser({
      ...input(first.email, 'Grace'),
      lastName: 'Hopper',
      passwordHash: '$2b$04$rotatedhashrotatedhashrotatedhashrotatedhashrotatedha',
    });

    expect(second.id).toBe(first.id);
    expect(second.firstName).toBe('Grace');
    expect(second.agencyId).toBe(agency.id);
    expect(await prisma.agency.count()).toBe(agenciesAfterFirst);

    await prisma.agency.delete({ where: { id: agency.id } });
  });

  it('lets exactly one of two concurrent registrations win', async () => {
    const email = uniqueEmail('race');
    createdEmails.push(email);
    const agenciesBefore = await prisma.agency.count();

    const attempt = (firstName: string) => registerUser(input(email, firstName));

    const results = await Promise.allSettled([attempt('First'), attempt('Second')]);
    const winners = results.filter((r) => r.status === 'fulfilled');

    expect(winners.length, 'exactly one registration should win').toBe(1);
    expect(await prisma.agency.count(), 'no agency may be created').toBe(agenciesBefore);
  });
});
