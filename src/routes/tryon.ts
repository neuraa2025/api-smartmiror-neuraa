import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

const router = Router();
const prisma = new PrismaClient();

// Configure multer for file uploads (backward compatibility)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `user-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}.jpg`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// FitRoom API Configuration
const FITROOM_API_URL = "https://platform.fitroom.app/api/tryon/v2/tasks";
const FITROOM_API_KEY =
  "444fd7cf3b3447ec8323cc2cd02a790876ea6ec13f1835b2c419ea6b25946acb";

console.log("🔧 FitRoom API Configuration:");
console.log("   🌐 API URL:", FITROOM_API_URL);
console.log("   🔑 API Key:", FITROOM_API_KEY ? "✅ Configured" : "❌ Missing");
if (FITROOM_API_KEY) {
  console.log("   ✅ Real FitRoom integration enabled");
} else {
  console.log("   ⚠️  FitRoom API Key missing - using MOCK responses");
}

interface TryOnRequest {
  userImagePath?: string;
  userImageBase64?: string;
  selectedOutfitIds: number[];
  userId?: number;
}

interface FitRoomResponse {
  taskId: string;
  resultImageUrl?: string;
  status: "processing" | "completed" | "failed";
}

// Helper function to validate and convert userId
function validateUserId(userId: any): number {
  if (!userId) return 1; // Default value

  const numericUserId = parseInt(userId, 10);

  if (isNaN(numericUserId) || numericUserId <= 0) {
    throw new Error("Invalid userId: must be a positive integer");
  }

  return numericUserId;
}

// Helper function to validate base64 image
function validateBase64Image(base64String: string): boolean {
  try {
    if (!base64String || typeof base64String !== "string") {
      return false;
    }

    // Check for data URL format
    if (base64String.startsWith("data:image/")) {
      const base64Data = base64String.split(",")[1];
      if (!base64Data) return false;

      // Try to decode
      Buffer.from(base64Data, "base64");
      return true;
    }

    // Try direct base64 decode
    Buffer.from(base64String, "base64");
    return true;
  } catch (error) {
    return false;
  }
}

// Helper function to save base64 to file
async function saveBase64ToFile(
  base64Data: string,
  prefix: string
): Promise<string> {
  try {
    // Remove data URL prefix if present (data:image/jpeg;base64,)
    const base64String = base64Data.replace(/^data:image\/[a-z]+;base64,/, "");

    // Create buffer from base64
    const imageBuffer = Buffer.from(base64String, "base64");

    // Generate unique filename
    const filename = `${prefix}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}.jpg`;

    // Ensure temp directory exists
    const tempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const filePath = path.join(tempDir, filename);

    // Write buffer to file
    fs.writeFileSync(filePath, imageBuffer);

    console.log(`✅ Base64 image saved to: ${filePath}`);

    // Schedule file deletion after processing
    setTimeout(() => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Temporary file deleted: ${filePath}`);
      }
    }, 60000); // Delete after 1 minute

    return filePath;
  } catch (error) {
    console.error("Error saving base64 to file:", error);
    throw new Error("Failed to process base64 image");
  }
}

// Middleware to handle process abortion
router.use((req, res, next) => {
  req.on("close", () => {
    console.log("🔴 Request aborted by the client.");
    // Add logic to stop backend processing if needed
  });
  next();
});

// Helper function to convert base64 to buffer
async function convertBase64ToBuffer(base64Data: string): Promise<Buffer> {
  try {
    // Remove data URL prefix if present
    const base64String = base64Data.replace(/^data:image\/[a-z]+;base64,/, "");

    // Convert to buffer
    const buffer = Buffer.from(base64String, "base64");

    console.log(`✅ Base64 converted to buffer: ${buffer.length} bytes`);
    return buffer;
  } catch (error) {
    console.error("Error converting base64 to buffer:", error);
    throw new Error("Failed to process base64 outfit image");
  }
}

// POST /api/tryon/upload-and-start-base64 - New endpoint for base64 images
router.post("/upload-and-start-base64", async (req, res) => {
  console.log("🚀 =========================");
  console.log("🚀 BASE64 UPLOAD AND TRY-ON PROCESS STARTED");
  console.log("🚀 =========================");

  try {
    const { userImageBase64, selectedOutfitIds, userId } = req.body;

    // Fix: Ensure userId is a number
    const numericUserId = validateUserId(userId);

    console.log("📥 Request received:");
    console.log("   👤 User ID:", numericUserId);
    console.log(
      "   🖼️  User Image Base64 Length:",
      userImageBase64?.length || 0
    );
    console.log("   👗 Selected Outfit IDs:", selectedOutfitIds);
    console.log("   📊 Total Outfits:", selectedOutfitIds?.length || 0);

    // Validate required fields
    if (!userImageBase64) {
      console.log("❌ VALIDATION FAILED: No user image base64 provided");
      return res.status(400).json({
        success: false,
        message: "User image (base64) is required",
      });
    }

    if (!selectedOutfitIds || selectedOutfitIds.length === 0) {
      console.log("❌ VALIDATION FAILED: No outfits selected");
      return res.status(400).json({
        success: false,
        message: "Selected outfits are required",
      });
    }

    // Validate base64 format
    if (!validateBase64Image(userImageBase64)) {
      console.log("❌ VALIDATION FAILED: Invalid base64 image format");
      return res.status(400).json({
        success: false,
        message: "Invalid base64 image format",
      });
    }

    // Convert base64 to file for processing
    const userImagePath = await saveBase64ToFile(userImageBase64, "user");

    // Get selected outfits from database
    console.log("🔍 Fetching outfits from database...");
    const outfits = await prisma.outfit.findMany({
      where: {
        id: { in: selectedOutfitIds },
        isActive: true,
      },
      include: {
        category: {
          include: {
            gender: true,
          },
        },
      },
    });

    console.log("📦 Database Results:");
    console.log("   ✅ Found Outfits:", outfits.length);
    outfits.forEach((outfit, index) => {
      console.log(`   ${index + 1}. ID: ${outfit.id}, Name: ${outfit.name}`);
      console.log(
        `      Category: ${outfit.category?.displayName}, Gender: ${outfit.category?.gender?.displayName}`
      );
      console.log(
        `      ClothType: ${
          outfit.clothType
        }, Image: ${outfit.imageUrl?.substring(0, 50)}...`
      );
    });

    if (outfits.length === 0) {
      console.log("❌ NO OUTFITS FOUND in database for provided IDs");
      return res.status(404).json({
        success: false,
        message: "No valid outfits found",
      });
    }

    // Create batch record
    const batchId = uuidv4();
    console.log("💾 Creating batch record with ID:", batchId);

    const batchRecord = await prisma.batchTryOnResult.create({
      data: {
        userId: numericUserId, // Fixed: using numeric userId
        userImagePath,
        batchId,
        totalOutfits: outfits.length,
        results: JSON.stringify([]),
      },
    });

    console.log("✅ Batch record created with ID:", batchRecord.id);

    // Start processing outfits individually
    console.log("🚀 Starting individual outfit processing...");
    processOutfitsIndividually(batchRecord.id, outfits, userImagePath);

    res.json({
      success: true,
      data: {
        batchId,
        totalOutfits: outfits.length,
        message: "Try-on process started (base64 processing)",
        userImagePath,
      },
    });
  } catch (error) {
    console.error("Error in base64 upload and try-on process:", error);
    res.status(500).json({
      success: false,
      message: "Failed to start try-on process",
    });
  }
});

// POST /api/tryon/upload-and-start - Updated to support both file upload and base64
router.post(
  "/upload-and-start",
  upload.single("userPhoto"),
  async (req, res) => {
    console.log("🚀 =========================");
    console.log("🚀 UPLOAD AND TRY-ON PROCESS STARTED");
    console.log("🚀 =========================");

    try {
      const file = req.file;
      const { userImageBase64, selectedOutfitIds, userId } = req.body;

      // Fix: Ensure userId is a number
      const numericUserId = validateUserId(userId);

      let userImagePath: string;

      // Handle both file upload and base64
      if (file) {
        console.log("📁 Using uploaded file");
        userImagePath = file.path;
      } else if (userImageBase64) {
        console.log("📝 Using base64 image");
        if (!validateBase64Image(userImageBase64)) {
          return res.status(400).json({
            success: false,
            message: "Invalid base64 image format",
          });
        }
        userImagePath = await saveBase64ToFile(userImageBase64, "user");
      } else {
        console.log("❌ VALIDATION FAILED: No user photo provided");
        return res.status(400).json({
          success: false,
          message: "User photo (file or base64) is required",
        });
      }

      const parsedOutfitIds =
        typeof selectedOutfitIds === "string"
          ? JSON.parse(selectedOutfitIds)
          : selectedOutfitIds;

      console.log("📥 Request received:");
      console.log("   👤 User ID:", numericUserId);
      console.log("   🖼️  User Image Path:", userImagePath);
      console.log("   📁 File Size:", file?.size || "base64");
      console.log("   👗 Selected Outfit IDs:", parsedOutfitIds);
      console.log("   📊 Total Outfits:", parsedOutfitIds?.length || 0);

      if (!parsedOutfitIds || parsedOutfitIds.length === 0) {
        console.log("❌ VALIDATION FAILED: No outfits selected");
        return res.status(400).json({
          success: false,
          message: "Selected outfits are required",
        });
      }

      // Continue with existing logic...
      const outfits = await prisma.outfit.findMany({
        where: {
          id: { in: parsedOutfitIds },
          isActive: true,
        },
        include: {
          category: {
            include: {
              gender: true,
            },
          },
        },
      });

      console.log("📦 Database Results:");
      console.log("   ✅ Found Outfits:", outfits.length);

      if (outfits.length === 0) {
        console.log("❌ NO OUTFITS FOUND in database for provided IDs");
        return res.status(404).json({
          success: false,
          message: "No valid outfits found",
        });
      }

      // Create batch record
      const batchId = uuidv4();
      const batchRecord = await prisma.batchTryOnResult.create({
        data: {
          userId: numericUserId, // Fixed: using numeric userId
          userImagePath,
          batchId,
          totalOutfits: outfits.length,
          results: JSON.stringify([]),
        },
      });

      // Start processing outfits individually
      processOutfitsIndividually(batchRecord.id, outfits, userImagePath);

      res.json({
        success: true,
        data: {
          batchId,
          totalOutfits: outfits.length,
          message: "Try-on process started (individual processing)",
          userImagePath,
        },
      });
    } catch (error) {
      console.error("Error in upload and try-on process:", error);
      res.status(500).json({
        success: false,
        message: "Failed to start try-on process",
      });
    }
  }
);

// POST /api/tryon/start - Updated for base64 support
router.post("/start", async (req, res) => {
  console.log("🚀 =========================");
  console.log("🚀 TRY-ON PROCESS STARTED");
  console.log("🚀 =========================");

  try {
    const {
      userImagePath,
      userImageBase64,
      selectedOutfitIds,
      userId,
    }: TryOnRequest = req.body;

    // Fix: Ensure userId is a number
    const numericUserId = validateUserId(userId);

    let resolvedUserImagePath: string;

    // Handle both path and base64
    if (userImageBase64) {
      console.log("📝 Processing base64 user image");
      if (!validateBase64Image(userImageBase64)) {
        return res.status(400).json({
          success: false,
          message: "Invalid base64 image format",
        });
      }
      resolvedUserImagePath = await saveBase64ToFile(userImageBase64, "user");
    } else if (userImagePath) {
      console.log("📁 Using provided image path");
      resolvedUserImagePath = userImagePath;
    } else {
      console.log("❌ VALIDATION FAILED: Missing user image");
      return res.status(400).json({
        success: false,
        message: "User image (path or base64) is required",
      });
    }

    console.log("📥 Request received:");
    console.log("   👤 User ID:", numericUserId);
    console.log("   🖼️  User Image Path:", resolvedUserImagePath);
    console.log("   👗 Selected Outfit IDs:", selectedOutfitIds);
    console.log("   📊 Total Outfits:", selectedOutfitIds?.length || 0);

    if (!selectedOutfitIds || selectedOutfitIds.length === 0) {
      console.log("❌ VALIDATION FAILED: Missing required data");
      return res.status(400).json({
        success: false,
        message: "Selected outfits are required",
      });
    }

    // Get selected outfits from database
    const outfits = await prisma.outfit.findMany({
      where: {
        id: { in: selectedOutfitIds },
        isActive: true,
      },
      include: {
        category: {
          include: {
            gender: true,
          },
        },
      },
    });

    if (outfits.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No valid outfits found",
      });
    }

    // Create batch record
    const batchId = uuidv4();
    const batchRecord = await prisma.batchTryOnResult.create({
      data: {
        userId: numericUserId, // Fixed: using numeric userId
        userImagePath: resolvedUserImagePath,
        batchId,
        totalOutfits: outfits.length,
        results: JSON.stringify([]),
      },
    });

    // Start processing outfits individually
    processOutfitsIndividually(batchRecord.id, outfits, resolvedUserImagePath);

    res.json({
      success: true,
      data: {
        batchId,
        totalOutfits: outfits.length,
        message: "Try-on process started",
      },
    });
  } catch (error) {
    console.error("Error starting try-on process:", error);
    res.status(500).json({
      success: false,
      message: "Failed to start try-on process",
    });
  }
});

// GET /api/tryon/results/:batchId - Get try-on results with pagination
router.get("/results/:batchId", async (req, res) => {
  try {
    const { batchId } = req.params;
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 5;

    const batchRecord = await prisma.batchTryOnResult.findUnique({
      where: { batchId },
    });

    if (!batchRecord) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    const allResults = JSON.parse(batchRecord.results);
    const paginatedResults = allResults.slice(offset, offset + limit);

    // Get outfit details for the paginated results
    const outfitIds = paginatedResults.map((result: any) => result.outfitId);
    const outfits = await prisma.outfit.findMany({
      where: { id: { in: outfitIds } },
      include: {
        category: {
          include: {
            gender: true,
          },
        },
      },
    });

    // Combine results with outfit details
    const enrichedResults = paginatedResults.map((result: any) => {
      const outfit = outfits.find((o) => o.id === result.outfitId);
      return {
        ...result,
        outfit,
      };
    });

    res.json({
      success: true,
      data: {
        results: enrichedResults,
        pagination: {
          offset,
          limit,
          total: allResults.length,
          hasMore: offset + limit < allResults.length,
        },
        batch: {
          id: batchRecord.id,
          batchId: batchRecord.batchId,
          status: batchRecord.status,
          totalOutfits: batchRecord.totalOutfits,
          completedCount: batchRecord.completedCount,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching try-on results:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch try-on results",
    });
  }
});

// GET /api/tryon/status/:batchId - Get batch status
router.get("/status/:batchId", async (req, res) => {
  try {
    const { batchId } = req.params;

    const batchRecord = await prisma.batchTryOnResult.findUnique({
      where: { batchId },
      select: {
        id: true,
        batchId: true,
        status: true,
        totalOutfits: true,
        completedCount: true,
        results: true,
      },
    });

    if (!batchRecord) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    const results = JSON.parse(batchRecord.results);

    res.json({
      success: true,
      data: {
        batchId: batchRecord.batchId,
        status: batchRecord.status,
        progress: {
          completed: batchRecord.completedCount,
          total: batchRecord.totalOutfits,
          percentage: Math.round(
            (batchRecord.completedCount / batchRecord.totalOutfits) * 100
          ),
        },
        availableResults: results.length,
      },
    });
  } catch (error) {
    console.error("Error fetching batch status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch batch status",
    });
  }
});

// POST /api/tryon/single - New endpoint for individual outfit try-on
router.post("/single", async (req, res) => {
  console.log("🚀 =========================");
  console.log("🚀 SINGLE OUTFIT TRY-ON STARTED");
  console.log("🚀 =========================");

  try {
    const { capturedImage, outfitId, userId = 1 } = req.body;

    console.log("📥 Single try-on request:");
    console.log("   👤 User ID:", userId);
    console.log("   🖼️  Captured Image Length:", capturedImage?.length || 0);
    console.log("   👗 Outfit ID:", outfitId);

    // Validate inputs
    if (!capturedImage || !outfitId) {
      return res.status(400).json({
        success: false,
        message: "Captured image and outfit ID are required",
      });
    }

    if (!validateBase64Image(capturedImage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid base64 image format",
      });
    }

    // Get outfit from database
    const outfit = await prisma.outfit.findUnique({
      where: { id: outfitId, isActive: true },
      include: {
        category: {
          include: {
            gender: true,
          },
        },
      },
    });

    if (!outfit) {
      return res.status(404).json({
        success: false,
        message: "Outfit not found",
      });
    }

    console.log("📦 Found outfit:", outfit.name);

    // Save base64 image to file
    const userImagePath = await saveBase64ToFile(capturedImage, "user-single");

    // Process single outfit
    const result = await processSingleOutfit(outfit, userImagePath);

    // Save result to database for reference
    await prisma.tryOnResult.create({
      data: {
        userId: validateUserId(userId),
        outfitId: outfit.id,
        resultImageUrl: result.resultImageUrl || "",
        taskId: result.taskId,
      },
    });

    res.json({
      success: true,
      data: {
        outfitId: outfit.id,
        resultImageUrl: result.resultImageUrl,
        status: result.status,
        taskId: result.taskId,
        outfit: {
          id: outfit.id,
          name: outfit.name,
          description: outfit.description,
          imageUrl: outfit.imageUrl,
          clothType: outfit.clothType,
        },
      },
    });
  } catch (error) {
    console.error("Error in single outfit try-on:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process single outfit try-on",
    });
  }
});

// POST /api/tryon/ai-suggestion - New endpoint for AI suggestion functionality
router.post("/ai-suggestion", async (req, res) => {
  console.log("🤖 =========================");
  console.log("🤖 AI SUGGESTION STARTED");
  console.log("🤖 =========================");

  try {
    const { capturedImage, gender, category, userId = 1 } = req.body;

    console.log("📥 AI suggestion request:");
    console.log("   👤 User ID:", userId);
    console.log("   🖼️  Captured Image Length:", capturedImage?.length || 0);
    console.log("   🚹 Gender:", gender);
    console.log("   📂 Category:", category);

    // Validate inputs
    if (!capturedImage || !gender || !category) {
      return res.status(400).json({
        success: false,
        message: "Captured image, gender, and category are required",
      });
    }

    if (!validateBase64Image(capturedImage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid base64 image format",
      });
    }

    // Get category information
    const categoryRecord = await prisma.category.findFirst({
      where: {
        name: category,
        gender: {
          name: gender,
        },
      },
    });

    if (!categoryRecord) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Get 10 random outfits from this category
    // Note: We'll use findMany with skip and take to simulate random selection
    const totalOutfits = await prisma.outfit.count({
      where: {
        categoryId: categoryRecord.id,
        isActive: true,
      },
    });

    // Get random starting point and take 10 outfits
    const randomSkip = Math.floor(
      Math.random() * Math.max(0, totalOutfits - 10)
    );
    const randomOutfits = await prisma.outfit.findMany({
      where: {
        categoryId: categoryRecord.id,
        isActive: true,
      },
      skip: randomSkip,
      take: 10,
    });

    console.log(
      `📊 Retrieved ${randomOutfits.length} random outfits for AI suggestion`
    );

    if (randomOutfits.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No outfits found in this category",
      });
    }

    // Save base64 image to file
    const userImagePath = await saveBase64ToFile(
      capturedImage,
      "ai-suggestion"
    );

    // Create batch record for AI suggestion (similar to multiple selection)
    const batchId = uuidv4();
    const batchRecord = await prisma.batchTryOnResult.create({
      data: {
        userId: validateUserId(userId),
        userImagePath,
        batchId,
        totalOutfits: randomOutfits.length,
        results: JSON.stringify([]),
      },
    });

    console.log(`✅ AI suggestion batch created: ${batchId}`);

    // Start processing outfits in background (one by one)
    processAISuggestionOutfits(
      batchRecord.id,
      randomOutfits,
      userImagePath
    ).catch((error: any) => {
      console.error("Error in AI suggestion processing:", error);
    });

    res.json({
      success: true,
      batchId,
      totalOutfits: randomOutfits.length,
      message: "AI suggestion processing started",
    });
  } catch (error) {
    console.error("Error in AI suggestion process:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process AI suggestion",
    });
  }
});

// GET /api/tryon/ai-suggestion-status/:batchId - Get AI suggestion status
router.get("/ai-suggestion-status/:batchId", async (req, res) => {
  try {
    const { batchId } = req.params;

    const batchRecord = await prisma.batchTryOnResult.findUnique({
      where: { batchId },
    });

    if (!batchRecord) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    const allResults = JSON.parse(batchRecord.results);

    // Get outfit details for all results
    const outfitIds = allResults.map((result: any) => result.outfitId);
    const outfits = await prisma.outfit.findMany({
      where: { id: { in: outfitIds } },
    });

    // Combine results with outfit details
    const enrichedResults = allResults.map((result: any) => {
      const outfit = outfits.find((o) => o.id === result.outfitId);
      return {
        id: result.outfitId,
        outfitId: result.outfitId,
        resultImageUrl: result.resultImageUrl,
        status: result.status,
        processedAt: result.processedAt,
        outfit,
      };
    });

    const isComplete = batchRecord.status === "completed";

    res.json({
      success: true,
      data: {
        results: enrichedResults,
        totalProcessed: batchRecord.completedCount,
        totalOutfits: batchRecord.totalOutfits,
        isComplete,
        hasMore: batchRecord.completedCount < batchRecord.totalOutfits,
      },
    });
  } catch (error) {
    console.error("Error fetching AI suggestion status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch AI suggestion status",
    });
  }
});

// POST /api/tryon/multiple - New endpoint for multiple outfit selection
router.post("/multiple", async (req, res) => {
  console.log("🚀 =========================");
  console.log("🚀 MULTIPLE OUTFITS TRY-ON STARTED");
  console.log("🚀 =========================");

  try {
    const { capturedImage, outfitIds, userId = 1 } = req.body;

    console.log("📥 Multiple try-on request:");
    console.log("   👤 User ID:", userId);
    console.log("   🖼️  Captured Image Length:", capturedImage?.length || 0);
    console.log("   👗 Outfit IDs:", outfitIds);
    console.log("   📊 Total Outfits:", outfitIds?.length || 0);

    // Validate inputs
    if (!capturedImage || !outfitIds || outfitIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Captured image and outfit IDs are required",
      });
    }

    if (!validateBase64Image(capturedImage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid base64 image format",
      });
    }

    // Get selected outfits from database
    const outfits = await prisma.outfit.findMany({
      where: {
        id: { in: outfitIds },
        isActive: true,
      },
      include: {
        category: {
          include: {
            gender: true,
          },
        },
      },
    });

    if (outfits.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No valid outfits found",
      });
    }

    console.log("📦 Found outfits:", outfits.length);

    // Save base64 image to file
    const userImagePath = await saveBase64ToFile(capturedImage, "multiple");

    // Create batch record for multiple selection
    const batchId = uuidv4();
    const batchRecord = await prisma.batchTryOnResult.create({
      data: {
        userId: validateUserId(userId),
        userImagePath,
        batchId,
        totalOutfits: outfits.length,
        results: JSON.stringify([]),
      },
    });

    console.log("✅ Multiple batch record created:", batchId);

    // Start processing selected outfits
    processOutfitsIndividually(batchRecord.id, outfits, userImagePath);

    res.json({
      success: true,
      data: {
        batchId,
        totalOutfits: outfits.length,
        selectedOutfits: outfits.map((outfit) => ({
          id: outfit.id,
          name: outfit.name,
          imageUrl: outfit.imageUrl,
          clothType: outfit.clothType,
        })),
        message: "Multiple outfits try-on started",
      },
    });
  } catch (error) {
    console.error("Error in multiple outfits try-on:", error);
    res.status(500).json({
      success: false,
      message: "Failed to start multiple outfits try-on",
    });
  }
});

// GET /api/tryon/batch-status/:batchId - Get batch status for multiple selection
router.get("/batch-status/:batchId", async (req, res) => {
  try {
    const { batchId } = req.params;

    const batchRecord = await prisma.batchTryOnResult.findUnique({
      where: { batchId },
    });

    if (!batchRecord) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    const allResults = JSON.parse(batchRecord.results);

    // Get outfit details for all results
    const outfitIds = allResults.map((result: any) => result.outfitId);
    const outfits = await prisma.outfit.findMany({
      where: { id: { in: outfitIds } },
    });

    // Combine results with outfit details
    const enrichedResults = allResults.map((result: any) => {
      const outfit = outfits.find((o) => o.id === result.outfitId);
      return {
        id: result.outfitId,
        outfitId: result.outfitId,
        resultImageUrl: result.resultImageUrl,
        status: result.status,
        processedAt: result.processedAt,
        outfit,
      };
    });

    const completedCount = allResults.filter(
      (r: any) => r.status === "completed"
    ).length;
    const failedCount = allResults.filter(
      (r: any) => r.status === "failed"
    ).length;
    const isComplete = batchRecord.status === "completed";

    res.json({
      success: true,
      data: {
        batchId: batchRecord.batchId,
        totalOutfits: batchRecord.totalOutfits,
        completedCount,
        failedCount,
        results: enrichedResults,
        isComplete,
      },
    });
  } catch (error) {
    console.error("Error fetching batch status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch batch status",
    });
  }
});

// Process outfits individually (one by one) with delay between each
async function processOutfitsIndividually(
  batchRecordId: number,
  outfits: any[],
  userImagePath: string
) {
  console.log("");
  console.log("🎯 ===============================");
  console.log(`🎯 INDIVIDUAL PROCESSING STARTED`);
  console.log("🎯 ===============================");

  try {
    const results = [];

    for (let i = 0; i < outfits.length; i++) {
      const outfit = outfits[i];
      console.log(
        `\n🚀 Processing outfit ${i + 1}/${outfits.length}: ID=${
          outfit.id
        }, Name="${outfit.name}"`
      );

      try {
        // Process single outfit
        const result = await processSingleOutfit(outfit, userImagePath);
        results.push(result);

        // Update database with this single result
        const batchRecord = await prisma.batchTryOnResult.findUnique({
          where: { id: batchRecordId },
        });

        if (batchRecord) {
          const existingResults = JSON.parse(batchRecord.results);
          const updatedResults = [...existingResults, result];

          await prisma.batchTryOnResult.update({
            where: { id: batchRecordId },
            data: {
              results: JSON.stringify(updatedResults),
              completedCount: batchRecord.completedCount + 1,
              status:
                batchRecord.completedCount + 1 >= batchRecord.totalOutfits
                  ? "completed"
                  : "processing",
            },
          });

          console.log(
            `✅ Updated database: ${batchRecord.completedCount + 1}/${
              batchRecord.totalOutfits
            } completed`
          );
        }

        // Add delay between requests to avoid overwhelming API
        if (i < outfits.length - 1) {
          console.log("⏳ Waiting 2 seconds before next outfit...");
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`❌ Error processing outfit ${outfit.id}:`, error);
        // Continue with next outfit even if one fails
        results.push({
          outfitId: outfit.id,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          processedAt: new Date().toISOString(),
        });
      }
    }

    console.log(
      `\n🏁 Individual processing completed: ${results.length} outfits processed`
    );
  } catch (error) {
    console.error("❌ Error in individual processing:", error);

    // Update batch status to failed
    await prisma.batchTryOnResult.update({
      where: { id: batchRecordId },
      data: { status: "failed" },
    });
  }
}

// Helper function to process single outfit with FitRoom API
async function processSingleOutfit(
  outfit: any,
  userImagePath: string
): Promise<any> {
  console.log("");
  console.log("🧥 --------------------------------");
  console.log(`🧥 PROCESSING SINGLE OUTFIT`);
  console.log("🧥 --------------------------------");
  console.log(`👗 Outfit ID: ${outfit.id}`);
  console.log(`📛 Outfit Name: ${outfit.name}`);
  console.log(`🏷️  Cloth Type: ${outfit.clothType}`);
  console.log(`🖼️  User Image: ${userImagePath}`);
  console.log(`📷 Outfit Image: ${outfit.imageUrl?.substring(0, 100)}...`);

  try {
    if (!FITROOM_API_KEY) {
      console.log("🤖 MOCK FITROOM API CALL (API Key missing)");
      console.log("⏳ Simulating API processing time...");

      // Mock response when API key is missing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const mockResult = {
        taskId: uuidv4(),
        resultImageUrl: `https://picsum.photos/400/600?random=${outfit.id}`,
        status: "completed",
      };

      console.log("✅ Mock API Response:");
      console.log(`   🆔 Task ID: ${mockResult.taskId}`);
      console.log(`   🖼️  Result Image: ${mockResult.resultImageUrl}`);
      console.log(`   📊 Status: ${mockResult.status}`);

      return {
        outfitId: outfit.id,
        taskId: mockResult.taskId,
        resultImageUrl: mockResult.resultImageUrl,
        status: mockResult.status,
        processedAt: new Date().toISOString(),
      };
    }

    // Real FitRoom API integration
    console.log("🚀 REAL FITROOM API CALL");
    const result = await sendTryOnToFitRoom(userImagePath, outfit);

    console.log("✅ FitRoom API Response:");
    console.log(`   🆔 Task ID: ${result.taskId}`);
    console.log(`   🖼️  Result Image: ${result.resultImageUrl}`);
    console.log(`   📊 Status: ${result.status}`);

    return {
      outfitId: outfit.id,
      taskId: result.taskId,
      resultImageUrl: result.resultImageUrl,
      status: result.status,
      processedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Error processing outfit ${outfit.id}:`, error);
    return {
      outfitId: outfit.id,
      taskId: null,
      resultImageUrl: null,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
      processedAt: new Date().toISOString(),
    };
  }
}

// Map clothing types to FitRoom API format
function mapClothingType(clothType: string): string {
  const lowerType = clothType.toLowerCase();

  if (
    lowerType.includes("traditional") ||
    lowerType.includes("blazer") ||
    lowerType.includes("chudi") ||
    lowerType.includes("modern") ||
    lowerType.includes("fullbody") ||
    lowerType.includes("full")
  ) {
    return "full_set";
  }

  return "upper";
}

// Process AI suggestion outfits one by one
async function processAISuggestionOutfits(
  batchRecordId: number,
  outfits: any[],
  userImagePath: string
) {
  console.log("");
  console.log("🤖 ===============================");
  console.log(`🤖 AI SUGGESTION PROCESSING STARTED`);
  console.log("🤖 ===============================");

  try {
    for (let i = 0; i < outfits.length; i++) {
      const outfit = outfits[i];
      console.log(
        `\n🔄 Processing AI suggestion ${i + 1}/${outfits.length}: ID=${
          outfit.id
        }, Name="${outfit.name}"`
      );

      try {
        // Process single outfit
        const result = await processSingleOutfit(outfit, userImagePath);

        console.log(
          `✅ Successfully processed outfit: ${outfit.name} - Result URL: ${result.resultImageUrl}`
        );

        // Save individual result to database immediately
        const batchRecord = await prisma.batchTryOnResult.findUnique({
          where: { id: batchRecordId },
        });

        if (batchRecord) {
          const existingResults = JSON.parse(batchRecord.results);
          const newResult = {
            outfitId: outfit.id,
            resultImageUrl: result.resultImageUrl,
            status: result.status,
            processedAt: new Date().toISOString(),
          };
          const updatedResults = [...existingResults, newResult];

          await prisma.batchTryOnResult.update({
            where: { id: batchRecordId },
            data: {
              results: JSON.stringify(updatedResults),
              completedCount: batchRecord.completedCount + 1,
            },
          });
        }

        console.log(
          `💾 Saved AI suggestion result for outfit ${outfit.id} to database`
        );

        // Small delay between processing each outfit to allow frontend to update
        if (i < outfits.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`❌ Failed to process outfit ${outfit.name}:`, error);

        // Save failed result to database
        const batchRecord = await prisma.batchTryOnResult.findUnique({
          where: { id: batchRecordId },
        });

        if (batchRecord) {
          const existingResults = JSON.parse(batchRecord.results);
          const failedResult = {
            outfitId: outfit.id,
            resultImageUrl: null,
            status: "failed",
            processedAt: new Date().toISOString(),
            error: (error as Error).message,
          };
          const updatedResults = [...existingResults, failedResult];

          await prisma.batchTryOnResult.update({
            where: { id: batchRecordId },
            data: {
              results: JSON.stringify(updatedResults),
              completedCount: batchRecord.completedCount + 1,
            },
          });
        }
      }
    }

    // Mark batch as completed
    await prisma.batchTryOnResult.update({
      where: { id: batchRecordId },
      data: { status: "completed" },
    });

    console.log("");
    console.log("🎉 ================================");
    console.log(`🎉 AI SUGGESTION PROCESSING COMPLETED`);
    console.log(`🎉 Total outfits processed: ${outfits.length}`);
    console.log("🎉 ================================");
  } catch (error) {
    console.error("❌ Error in AI suggestion processing:", error);

    // Mark batch as failed
    await prisma.batchTryOnResult.update({
      where: { id: batchRecordId },
      data: { status: "failed" },
    });
  }
}

// Updated function to send try-on request to FitRoom API with base64 support
async function sendTryOnToFitRoom(
  userImagePath: string,
  outfit: any
): Promise<any> {
  const formData = new FormData();

  // Handle user image path - convert relative path to absolute if needed
  let resolvedUserImagePath = userImagePath;
  if (!path.isAbsolute(userImagePath)) {
    const possiblePaths = [
      path.join(process.cwd(), "public", userImagePath),
      path.join(process.cwd(), "temp", path.basename(userImagePath)),
      path.join(__dirname, "../../temp", path.basename(userImagePath)),
      path.join(__dirname, "../../public", userImagePath),
    ];

    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        resolvedUserImagePath = possiblePath;
        break;
      }
    }
  }

  // Check if user image exists
  if (!fs.existsSync(resolvedUserImagePath)) {
    throw new Error(
      `User image not found: ${userImagePath}. Tried paths: ${resolvedUserImagePath}`
    );
  }

  console.log(`📁 Resolved user image path: ${resolvedUserImagePath}`);

  // Read user image
  const userImageBuffer = fs.readFileSync(resolvedUserImagePath);
  formData.append("model_image", userImageBuffer, {
    filename: "user.jpg",
    contentType: "image/jpeg",
  });

  // Handle outfit image - now supporting base64, HTTP URLs, and local files
  let outfitImageBuffer;

  if (outfit.imageUrl.startsWith("data:image/")) {
    // Handle base64 outfit image
    console.log("📥 Processing base64 outfit image");
    outfitImageBuffer = await convertBase64ToBuffer(outfit.imageUrl);
  } else if (outfit.imageUrl.startsWith("http")) {
    // Handle HTTP URL outfit image
    console.log("📥 Downloading outfit image from:", outfit.imageUrl);
    const outfitImageResponse = await axios.get(outfit.imageUrl, {
      responseType: "arraybuffer",
    });
    console.log("📥 Outfit image download status:", outfitImageResponse.status);
    outfitImageBuffer = Buffer.from(outfitImageResponse.data);
  } else {
    // Handle local file path (fallback)
    let outfitImagePath = outfit.imageUrl;
    if (!path.isAbsolute(outfitImagePath)) {
      const possiblePaths = [
        path.join(
          __dirname,
          "../../prisma/dbdata",
          outfit.imageUrl.replace("/images/", "")
        ),
        path.join(process.cwd(), "public", outfit.imageUrl),
        path.join(
          process.cwd(),
          "prisma/dbdata",
          outfit.imageUrl.replace("/images/", "")
        ),
        path.join(__dirname, "../..", outfit.imageUrl),
      ];

      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          outfitImagePath = possiblePath;
          break;
        }
      }
    }

    if (!fs.existsSync(outfitImagePath)) {
      console.log(`❌ Tried outfit image paths:`);
      console.log(`   Original: ${outfit.imageUrl}`);
      console.log(`   Resolved: ${outfitImagePath}`);
      throw new Error(`Outfit image not found: ${outfit.imageUrl}`);
    }

    outfitImageBuffer = fs.readFileSync(outfitImagePath);
  }

  formData.append("cloth_image", outfitImageBuffer, {
    filename: "outfit.jpg",
    contentType: "image/jpeg",
  });

  // Add cloth type with proper mapping
  const mappedClothType = mapClothingType(outfit.clothType);
  formData.append("cloth_type", mappedClothType);

  console.log(`📤 Sending try-on request:`);
  console.log(`   🏷️  Original type: ${outfit.clothType}`);
  console.log(`   🎯 Mapped type: ${mappedClothType}`);
  console.log(`   👤 User image: ${resolvedUserImagePath}`);
  console.log(
    `   👗 Outfit image type: ${
      outfit.imageUrl.startsWith("data:")
        ? "base64"
        : outfit.imageUrl.startsWith("http")
        ? "HTTP URL"
        : "local file"
    }`
  );

  // Send request to FitRoom API
  let response;
  try {
    response = await axios.post(FITROOM_API_URL, formData, {
      headers: {
        "X-API-KEY": FITROOM_API_KEY,
        ...formData.getHeaders(),
      },
    });
  } catch (error: any) {
    console.error("❌ FitRoom API Error:", {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
    });

    throw new Error(
      `FitRoom API failed: ${error.response?.status} - ${
        error.response?.statusText || error.message
      }`
    );
  }

  const taskId = response.data.task_id;
  console.log(`✅ Task created with ID: ${taskId}`);

  // Poll for result
  const resultImageUrl = await pollForResult(taskId);

  return {
    taskId,
    resultImageUrl,
    status: "completed",
  };
}

// Helper function to poll for task result
async function pollForResult(
  taskId: string,
  maxAttempts: number = 30
): Promise<string> {
  const pollUrl = `https://platform.fitroom.app/api/tryon/v2/tasks/${taskId}`;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(
      `📡 Polling attempt ${attempt + 1}/${maxAttempts} for task ${taskId}`
    );

    const response = await axios.get(pollUrl, {
      headers: {
        "X-API-KEY": FITROOM_API_KEY,
      },
    });

    const { status, download_signed_url } = response.data;

    if (status === "completed" || status === "COMPLETED") {
      console.log(`✅ Task ${taskId} completed successfully!`);
      return download_signed_url;
    } else if (status === "failed" || status === "FAILED") {
      const reason = response.data.reason || "Unknown reason";
      throw new Error(`FitRoom task failed: ${reason}`);
    }

    // Wait 2 seconds before next poll
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error("Task timeout");
}

export default router;
