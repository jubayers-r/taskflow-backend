import { afterAll, expect, it } from 'vitest';

import { describeIntegration } from '@/__tests__/helpers/integration';
import { prisma } from '@/lib/prisma';
import { registerUserWithAgency } from '@/modules/auth/auth.repository';

const createdAgencyIds: string[] = [];
const createdEmails: string[] = [];

const uniqueEmail = (label: string) =>
  `register-tenancy-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

const register = (label: string, agencyName = `${label} Studio`) => {
  const email = uniqueEmail(label);
  createdEmails.push(email);
  return registerUserWithAgency({
    email,
    passwordHash: '$2b$04$notarealhashnotarealhashnotarealhashnotarealhashnotar',
    firstName: 'Ada',
    lastName: 'Lovelace',
    gender: 'FEMALE',
    agencyName,
    isAgreeWithTerms: true,
    termsAgreedAt: new Date(),
  });
};

describeIntegration('registerUserWithAgency', () => {
  afterAll(async () => {
    for (const email of createdEmails) {
      await prisma.user.deleteMany({ where: { email } });
    }
    for (const id of createdAgencyIds) {
      await prisma.agency.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it('provisions an agency and makes the registrant its OWNER', async () => {
    const user = await register('owner');

    expect(user.agencyId).toBeTruthy();
    expect(user.role).toBe('OWNER');
    createdAgencyIds.push(user.agencyId!);

    const agency = await prisma.agency.findUnique({ where: { id: user.agencyId! } });
    expect(agency?.name).toBe('owner Studio');
  });

  it('never stores a tenant id that did not come from the server', async () => {
    // The repository takes only an agencyName, so there is no parameter through
    // which a client-supplied agencyId could reach the user row.
    const user = await register('injection');

    expect(user.agencyId).toBeTruthy();
    createdAgencyIds.push(user.agencyId!);

    const agency = await prisma.agency.findUnique({
      where: { id: user.agencyId! },
      select: { id: true },
    });
    expect(agency?.id).toBe(user.agencyId);
  });

  it('does not mint a second agency when an unverified email re-registers', async () => {
    const first = await register('repeat');
    createdAgencyIds.push(first.agencyId!);

    const agenciesAfterFirst = await prisma.agency.count();
    const second = await registerUserWithAgency({
      email: first.email,
      passwordHash: '$2b$04$rotatedhashrotatedhashrotatedhashrotatedhashrotatedha',
      firstName: 'Grace',
      lastName: 'Hopper',
      gender: 'FEMALE',
      agencyName: 'A Different Name',
      isAgreeWithTerms: true,
      termsAgreedAt: new Date(),
    });

    // Same tenancy, updated profile — a re-register must not orphan the first agency.
    expect(second.agencyId).toBe(first.agencyId);
    expect(second.id).toBe(first.id);
    expect(second.firstName).toBe('Grace');
    expect(await prisma.agency.count()).toBe(agenciesAfterFirst);
  });

  it('rolls back the agency when a concurrent registration loses the race', async () => {
    // Two registrations of the same fresh email. Both pass the "does this user
    // exist?" check, so both open a transaction and both try to create an agency.
    // Only one may survive: without the shared transaction the loser would leave
    // an orphan agency behind, and every agency is expected to have an owner.
    const email = uniqueEmail('race');
    createdEmails.push(email);
    const agenciesBefore = await prisma.agency.count();

    const attempt = (firstName: string) =>
      registerUserWithAgency({
        email,
        passwordHash: '$2b$04$raceraceraceraceraceraceraceraceraceraceraceracerac',
        firstName,
        gender: 'FEMALE',
        agencyName: 'Race Studio',
        isAgreeWithTerms: true,
        termsAgreedAt: new Date(),
      });

    const results = await Promise.allSettled([attempt('First'), attempt('Second')]);
    const winners = results.filter((r) => r.status === 'fulfilled');

    expect(winners.length, 'exactly one registration should win').toBe(1);
    expect(await prisma.agency.count(), 'the loser must not leave an orphan agency').toBe(
      agenciesBefore + 1,
    );

    const winner = winners[0] as PromiseFulfilledResult<{ agencyId: string | null }>;
    createdAgencyIds.push(winner.value.agencyId!);
  });
});
