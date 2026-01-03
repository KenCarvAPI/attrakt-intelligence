import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create a test client
  const client = await prisma.client.upsert({
    where: { slug: 'test-client' },
    update: {},
    create: {
      name: 'Test Client',
      slug: 'test-client',
    },
  });

  console.log('Created test client:', client.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
