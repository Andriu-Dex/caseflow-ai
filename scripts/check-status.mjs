import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = await import('../apps/api/dist/generated/prisma/client.js');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const presentations = await prisma.generatedFile.findMany({
    where: { path: { startsWith: 'docs/presentations/' } },
    select: { path: true },
    orderBy: { path: 'asc' },
  });
  console.log('Total cached presentations in DB:', presentations.length);
  presentations.forEach((p, i) => console.log(`${i + 1}. ${p.path}`));

  const runs = await prisma.generationRun.findMany({
    orderBy: { id: 'desc' },
    take: 5,
    include: { _count: { select: { files: true } } },
  });
  console.log('\nRecent Generation Runs:');
  const allRuns = await prisma.generationRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, createdAt: true, status: true, errorMessage: true },
  });
  console.log('Latest Run Error Message:');
  console.log(allRuns[0].errorMessage);
}

main().finally(() => prisma.$disconnect());
