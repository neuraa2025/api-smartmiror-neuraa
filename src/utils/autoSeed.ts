import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Function to check if database already has data
async function isDatabaseSeeded(): Promise<boolean> {
  try {
    const genderCount = await prisma.gender.count();
    const categoryCount = await prisma.category.count();
    const outfitCount = await prisma.outfit.count();

    return genderCount > 0 && categoryCount > 0 && outfitCount > 0;
  } catch (error) {
    console.log("🔍 Database check failed, assuming empty database");
    return false;
  }
}

// Auto-seed function that runs on server startup
export async function autoSeedDatabase(): Promise<void> {
  try {
    console.log("🔍 Checking if database needs seeding...");

    const isSeeded = await isDatabaseSeeded();
    if (isSeeded) {
      console.log("✅ Database already contains data, skipping auto-seed");
      return;
    }

    console.log("🌱 Empty database detected, starting auto-seed process...");

    // Import and run the seed function
    const seedModule = await import('../../prisma/seed');
    await seedModule.seedDatabase();

    console.log("🎉 Auto-seeding completed successfully!");
  } catch (error) {
    console.error("❌ Auto-seeding failed:", error);
    console.log("⚠️  Server will continue but database may be empty");
    console.log("💡 You can manually run: npm run prisma:seed");
  } finally {
    await prisma.$disconnect();
  }
}
