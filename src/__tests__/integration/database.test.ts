import { afterAll, expect, it } from 'vitest';

import { prisma } from '@/lib/prisma';
import { describeIntegration } from '@/__tests__/helpers/integration';

describeIntegration('database', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('has the init migration applied', async () => {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
    `;

    expect(rows.map((row) => row.migration_name)).toContain('20260918000000_init');
  });

  it('can round-trip an agency row', async () => {
    const agency = await prisma.agency.create({ data: { name: 'Integration Test Agency' } });
    expect(agency.id).toBeTruthy();
    await prisma.agency.delete({ where: { id: agency.id } });
  });
});
