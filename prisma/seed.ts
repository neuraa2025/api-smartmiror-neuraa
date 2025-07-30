import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

// Function to convert image file to base64
function getBase64Image(filePath: string): string {
  try {
    const imageBuffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().substring(1);
    const mimeType = ext === "jpg" ? "jpeg" : ext;
    const base64String = imageBuffer.toString("base64");
    return `data:image/${mimeType};base64,${base64String}`;
  } catch (error) {
    console.error(`Error reading image file ${filePath}:`, error);
    return "";
  }
}

// Unsplash banner images (these will remain as URLs since they're external)
const bannerImages = {
  genders: {
    mens: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=400&fit=crop",
    womens:
      "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=800&h=400&fit=crop",
    kids: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=800&h=400&fit=crop",
  },
  categories: {
    formals:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=300&fit=crop",
    causual:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=600&h=300&fit=crop",
    blazer:
      "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600&h=300&fit=crop",
    traditional:
      "https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=600&h=300&fit=crop",
    casuals:
      "https://images.unsplash.com/photo-1479936343636-73cdc5aae0c3?w=600&h=300&fit=crop",
    chudi:
      "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&h=300&fit=crop",
    modern_wears:
      "https://images.unsplash.com/photo-1566479179817-c0df37b09d9d?w=600&h=300&fit=crop",
  },
};

// Category configurations
const categoryConfigs = {
  mens: [
    { name: "formals", displayName: "Formals", clothType: "upper" },
    { name: "causual", displayName: "Causual", clothType: "upper" },
    { name: "blazer", displayName: "Blazer", clothType: "fullbody" },
    { name: "traditional", displayName: "Traditional", clothType: "upper" },
  ],
  womens: [
    { name: "traditional", displayName: "Traditional", clothType: "upper" },
    { name: "casuals", displayName: "Casuals", clothType: "upper" },
    { name: "chudi", displayName: "Chudi", clothType: "fullbody" },
    {
      name: "modern_wears",
      displayName: "Modern_wears",
      clothType: "fullbody",
    },
    { name: "blazer", displayName: "Blazer", clothType: "fullbody" },
  ],
  kids: [],
};

// Random price generator for different categories
function getRandomPrice(categoryName: string): number {
  const priceRanges: { [key: string]: { min: number; max: number } } = {
    formals: { min: 300, max: 600 },
    causual: { min: 300, max: 600 },
    casuals: { min: 300, max: 600 },
    traditional: { min: 700, max: 1000 },
    blazer: { min: 5000, max: 8000 },
    chudi: { min: 700, max: 1000 },
    modern_wears: { min: 700, max: 1000 },
  };

  const range = priceRanges[categoryName] || { min: 300, max: 600 };
  return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
}

// Function to get all images from a directory
function getImagesFromDirectory(dirPath: string): string[] {
  try {
    const files = fs.readdirSync(dirPath);
    return files.filter(
      (file) =>
        file.toLowerCase().endsWith(".jpg") ||
        file.toLowerCase().endsWith(".jpeg") ||
        file.toLowerCase().endsWith(".png") ||
        file.toLowerCase().endsWith(".webp")
    );
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
    return [];
  }
}

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

async function main() {
  console.log("🌱 Starting database seeding...");

  // Check if database is already seeded
  const isSeeded = await isDatabaseSeeded();
  if (isSeeded) {
    console.log("✅ Database already contains data, skipping seed process");
    return;
  }

  console.log("📊 Empty database detected, proceeding with seeding...");

  // Create sample users (upsert to avoid conflicts)
  const user1 = await prisma.user.upsert({
    where: { email: "john@example.com" },
    update: {},
    create: {
      name: "John Doe",
      email: "john@example.com",
      plan: "Premium",
    },
  });

  console.log("✅ Created sample users");

  // Create genders
  const genders = await Promise.all([
    prisma.gender.create({
      data: {
        name: "mens",
        displayName: "Men's",
        bannerImage: bannerImages.genders.mens,
      },
    }),
    prisma.gender.create({
      data: {
        name: "womens",
        displayName: "Women's",
        bannerImage: bannerImages.genders.womens,
      },
    }),
    prisma.gender.create({
      data: {
        name: "kids",
        displayName: "Kids",
        bannerImage: bannerImages.genders.kids,
        isActive: false, // Keep inactive for now
      },
    }),
  ]);

  console.log("✅ Created genders");

  // Create categories and outfits
  for (const gender of genders) {
    const genderConfig =
      categoryConfigs[gender.name as keyof typeof categoryConfigs];

    for (const categoryConfig of genderConfig) {
      // Create category
      const category = await prisma.category.create({
        data: {
          name: categoryConfig.name,
          displayName: categoryConfig.displayName,
          bannerImage:
            bannerImages.categories[
              categoryConfig.name as keyof typeof bannerImages.categories
            ] || bannerImages.categories.formals,
          genderId: gender.id,
        },
      });

      // Get images from folder
      const folderPath = path.join(
        process.cwd(),
        "prisma",
        "dbdata",
        gender.name,
        categoryConfig.displayName
      );
      const imageFiles = getImagesFromDirectory(folderPath);

      console.log(
        `📁 Found ${imageFiles.length} images in ${gender.name}/${categoryConfig.displayName}`
      );

      // Create outfits from images with base64 encoding
      for (let i = 0; i < imageFiles.length; i++) {
        const imageFile = imageFiles[i];

        // Generate better names like "Casual 1", "Formal 2", etc.
        const outfitName = `${categoryConfig.displayName} ${i + 1}`;

        // Convert image to base64
        const imagePath = path.join(folderPath, imageFile);
        const base64Image = getBase64Image(imagePath);

        if (base64Image) {
          await prisma.outfit.create({
            data: {
              name: outfitName,
              categoryId: category.id,
              clothType: categoryConfig.clothType,
              imageUrl: base64Image, // Now storing base64 instead of URL
              description: `${
                categoryConfig.displayName
              } outfit for ${gender.displayName.toLowerCase()}`,
              price: getRandomPrice(categoryConfig.name),
            },
          });
        } else {
          console.warn(`⚠️ Skipped ${imageFile} due to conversion error`);
        }
      }

      console.log(
        `✅ Created ${imageFiles.length} outfits for ${gender.name}/${categoryConfig.displayName}`
      );
    }
  }

  console.log("🎉 Database has been seeded successfully!");
}

// Export the main function for use in server
export { main as seedDatabase, isDatabaseSeeded };

// Only run if this file is executed directly
if (require.main === module) {
  main()
    .catch((e) => {
      console.error("❌ Seeding failed:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
