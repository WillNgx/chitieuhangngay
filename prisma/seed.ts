import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TAXONOMY: Record<string, string[]> = {
  Food: ['Restaurant', 'Fast Food', 'Coffee', 'Groceries', 'Delivery', '7-Eleven', 'Big C'],
  Transport: ['Grab', 'Taxi', 'Bus', 'Train', 'Fuel', 'Parking', 'Rental'],
  Shopping: ['Clothes', 'Electronics', 'Games', 'Household', 'Other'],
  Entertainment: ['Movie', 'Game', 'Subscription', 'Event'],
  Health: ['Medicine', 'Hospital', 'Fitness'],
  Bills: ['Internet', 'Phone', 'Electricity', 'Other'],
  Travel: ['Hotel', 'Sightseeing', 'Immigration', 'Laundry'],
};

export async function seedCategories() {
  // eslint-disable-next-line no-console
  console.log('🌱 Seeding categories taxonomy...');

  for (const [parentName, subcategories] of Object.entries(TAXONOMY)) {
    // Find or create parent category
    let parent = await prisma.category.findFirst({
      where: { name: parentName, parentId: null },
    });

    if (!parent) {
      parent = await prisma.category.create({
        data: {
          name: parentName,
          type: 'expense',
        },
      });
      // eslint-disable-next-line no-console
      console.log(`  ➕ Created parent category: ${parentName}`);
    }

    // Seed subcategories
    for (const subName of subcategories) {
      const existing = await prisma.category.findFirst({
        where: { name: subName, parentId: parent.id },
      });

      if (!existing) {
        await prisma.category.create({
          data: {
            name: subName,
            parentId: parent.id,
            type: 'expense',
          },
        });
        // eslint-disable-next-line no-console
        console.log(`    ↳ Created subcategory: ${subName}`);
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log('✅ Categories taxonomy seeded successfully!');
}

async function main() {
  try {
    await seedCategories();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
