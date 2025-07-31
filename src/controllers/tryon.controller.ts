import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

// FitRoom API Configuration
const FITROOM_API_URL = "https://platform.fitroom.app/api/tryon/v2/tasks";
const FITROOM_API_KEY = process.env.FITROOM_API_KEY;

// Interfaces
interface TryOnRequest {
  userImagePath?: string;
  userImageBase64?: string;
  selectedOutfitIds: number[];
  userId?: number;
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
    if (!base64String || typeof base64String !== "string") return false;
    if (base64String.startsWith("data:image/")) {
      const base64Data = base64String.split(",")[1];
      if (!base64Data) return false;
      Buffer.from(base64Data, "base64");
      return true;
    }
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
    const base64String = base64Data.replace(/^data:image\/[a-z]+;base64,/, "");
    const imageBuffer = Buffer.from(base64String, "base64");
    const filename = `${prefix}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}.jpg`;
    const tempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, imageBuffer);
    setTimeout(() => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }, 60000); // Delete after 1 minute
    return filePath;
  } catch (error) {
    console.error("Error saving base64 to file:", error);
    throw new Error("Failed to process base64 image");
  }
}

// Helper function to convert base64 to buffer
async function convertBase64ToBuffer(base64Data: string): Promise<Buffer> {
  try {
    const base64String = base64Data.replace(/^data:image\/[a-z]+;base64,/, "");
    const buffer = Buffer.from(base64String, "base64");
    return buffer;
  } catch (error) {
    console.error("Error converting base64 to buffer:", error);
    throw new Error("Failed to process base64 outfit image");
  }
}

// Helper function to process single outfit with FitRoom API
async function processSingleOutfit(
  outfit: any,
  userImagePath: string
): Promise<any> {
  try {
    if (!FITROOM_API_KEY) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const mockResult = {
        taskId: uuidv4(),
        resultImageUrl: `https://picsum.photos/400/600?random=${outfit.id}`,
        status: "completed",
      };
      return {
        outfitId: outfit.id,
        taskId: mockResult.taskId,
        resultImageUrl: mockResult.resultImageUrl,
        status: mockResult.status,
        processedAt: new Date().toISOString(),
      };
    }

    const result = await sendTryOnToFitRoom(userImagePath, outfit);
    return {
      outfitId: outfit.id,
      taskId: result.taskId,
      resultImageUrl: result.resultImageUrl,
      status: result.status,
      processedAt: new Date().toISOString(),
    };
  } catch (error) {
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

// Process outfits individually (one by one) with delay between each
async function processOutfitsIndividually(
  batchRecordId: number,
  outfits: any[],
  userImagePath: string
) {
  for (let i = 0; i < outfits.length; i++) {
    const outfit = outfits[i];
    try {
      const result = await processSingleOutfit(outfit, userImagePath);
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
      }
      if (i < outfits.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error) {
      // Continue with next outfit even if one fails
    }
  }
}

// Process AI suggestion outfits one by one
async function processAISuggestionOutfits(
  batchRecordId: number,
  outfits: any[],
  userImagePath: string
) {
  try {
    for (let i = 0; i < outfits.length; i++) {
      const outfit = outfits[i];
      try {
        const result = await processSingleOutfit(outfit, userImagePath);
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
        if (i < outfits.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (error) {
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
    await prisma.batchTryOnResult.update({
      where: { id: batchRecordId },
      data: { status: "completed" },
    });
  } catch (error) {
    await prisma.batchTryOnResult.update({
      where: { id: batchRecordId },
      data: { status: "failed" },
    });
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

// Updated function to send try-on request to FitRoom API with base64 support
async function sendTryOnToFitRoom(
  userImagePath: string,
  outfit: any
): Promise<any> {
  const formData = new FormData();
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
  if (!fs.existsSync(resolvedUserImagePath)) {
    throw new Error(`User image not found: ${userImagePath}`);
  }
  const userImageBuffer = fs.readFileSync(resolvedUserImagePath);
  formData.append("model_image", userImageBuffer, {
    filename: "user.jpg",
    contentType: "image/jpeg",
  });

  let outfitImageBuffer;
  if (outfit.imageUrl.startsWith("data:image/")) {
    outfitImageBuffer = await convertBase64ToBuffer(outfit.imageUrl);
  } else if (outfit.imageUrl.startsWith("http")) {
    const outfitImageResponse = await axios.get(outfit.imageUrl, {
      responseType: "arraybuffer",
    });
    outfitImageBuffer = Buffer.from(outfitImageResponse.data);
  } else {
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
      throw new Error(`Outfit image not found: ${outfit.imageUrl}`);
    }
    outfitImageBuffer = fs.readFileSync(outfitImagePath);
  }
  formData.append("cloth_image", outfitImageBuffer, {
    filename: "outfit.jpg",
    contentType: "image/jpeg",
  });

  const mappedClothType = mapClothingType(outfit.clothType);
  formData.append("cloth_type", mappedClothType);

  let response;
  try {
    response = await axios.post(FITROOM_API_URL, formData, {
      headers: {
        "X-API-KEY": FITROOM_API_KEY,
        ...formData.getHeaders(),
      },
    });
  } catch (error: any) {
    throw new Error(`FitRoom API failed: ${error.response?.status}`);
  }

  const taskId = response.data.task_id;
  const resultImageUrl = await pollForResult(taskId);
  return { taskId, resultImageUrl, status: "completed" };
}

// Helper function to poll for task result
async function pollForResult(
  taskId: string,
  maxAttempts: number = 30
): Promise<string> {
  const pollUrl = `https://platform.fitroom.app/api/tryon/v2/tasks/${taskId}`;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await axios.get(pollUrl, {
      headers: { "X-API-KEY": FITROOM_API_KEY },
    });
    const { status, download_signed_url } = response.data;
    if (status === "completed" || status === "COMPLETED") {
      return download_signed_url;
    } else if (status === "failed" || status === "FAILED") {
      const reason = response.data.reason || "Unknown reason";
      throw new Error(`FitRoom task failed: ${reason}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Task timeout");
}

// Controller functions
export const uploadAndStartBase64 = async (req: Request, res: Response) => {
  try {
    const { userImageBase64, selectedOutfitIds, userId } = req.body;
    const numericUserId = validateUserId(userId);
    if (!userImageBase64) {
      return res
        .status(400)
        .json({ success: false, message: "User image (base64) is required" });
    }
    if (!selectedOutfitIds || selectedOutfitIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Selected outfits are required" });
    }
    if (!validateBase64Image(userImageBase64)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid base64 image format" });
    }
    const userImagePath = await saveBase64ToFile(userImageBase64, "user");
    const outfits = await prisma.outfit.findMany({
      where: { id: { in: selectedOutfitIds }, isActive: true },
      include: { category: { include: { gender: true } } },
    });
    if (outfits.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No valid outfits found" });
    }
    const batchId = uuidv4();
    const batchRecord = await prisma.batchTryOnResult.create({
      data: {
        userId: numericUserId,
        userImagePath,
        batchId,
        totalOutfits: outfits.length,
        results: JSON.stringify([]),
      },
    });
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
    res
      .status(500)
      .json({ success: false, message: "Failed to start try-on process" });
  }
};

export const uploadAndStart = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { userImageBase64, selectedOutfitIds, userId } = req.body;
    const numericUserId = validateUserId(userId);
    let userImagePath: string;
    if (file) {
      userImagePath = file.path;
    } else if (userImageBase64) {
      if (!validateBase64Image(userImageBase64)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid base64 image format" });
      }
      userImagePath = await saveBase64ToFile(userImageBase64, "user");
    } else {
      return res.status(400).json({
        success: false,
        message: "User photo (file or base64) is required",
      });
    }
    const parsedOutfitIds =
      typeof selectedOutfitIds === "string"
        ? JSON.parse(selectedOutfitIds)
        : selectedOutfitIds;
    if (!parsedOutfitIds || parsedOutfitIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Selected outfits are required" });
    }
    const outfits = await prisma.outfit.findMany({
      where: { id: { in: parsedOutfitIds }, isActive: true },
      include: { category: { include: { gender: true } } },
    });
    if (outfits.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No valid outfits found" });
    }
    const batchId = uuidv4();
    const batchRecord = await prisma.batchTryOnResult.create({
      data: {
        userId: numericUserId,
        userImagePath,
        batchId,
        totalOutfits: outfits.length,
        results: JSON.stringify([]),
      },
    });
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
    res
      .status(500)
      .json({ success: false, message: "Failed to start try-on process" });
  }
};

export const startTryOn = async (req: Request, res: Response) => {
  try {
    const {
      userImagePath,
      userImageBase64,
      selectedOutfitIds,
      userId,
    }: TryOnRequest = req.body;
    const numericUserId = validateUserId(userId);
    let resolvedUserImagePath: string;
    if (userImageBase64) {
      if (!validateBase64Image(userImageBase64)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid base64 image format" });
      }
      resolvedUserImagePath = await saveBase64ToFile(userImageBase64, "user");
    } else if (userImagePath) {
      resolvedUserImagePath = userImagePath;
    } else {
      return res
        .status(400)
        .json({
          success: false,
          message: "User image (path or base64) is required",
        });
    }
    if (!selectedOutfitIds || selectedOutfitIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Selected outfits are required" });
    }
    const outfits = await prisma.outfit.findMany({
      where: { id: { in: selectedOutfitIds }, isActive: true },
      include: { category: { include: { gender: true } } },
    });
    if (outfits.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No valid outfits found" });
    }
    const batchId = uuidv4();
    const batchRecord = await prisma.batchTryOnResult.create({
      data: {
        userId: numericUserId,
        userImagePath: resolvedUserImagePath,
        batchId,
        totalOutfits: outfits.length,
        results: JSON.stringify([]),
      },
    });
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
    res
      .status(500)
      .json({ success: false, message: "Failed to start try-on process" });
  }
};

export const getTryOnResults = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 5;
    const batchRecord = await prisma.batchTryOnResult.findUnique({
      where: { batchId },
    });
    if (!batchRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Batch not found" });
    }
    const allResults = JSON.parse(batchRecord.results);
    const paginatedResults = allResults.slice(offset, offset + limit);
    const outfitIds = paginatedResults.map((result: any) => result.outfitId);
    const outfits = await prisma.outfit.findMany({
      where: { id: { in: outfitIds } },
      include: { category: { include: { gender: true } } },
    });
    const enrichedResults = paginatedResults.map((result: any) => {
      const outfit = outfits.find((o) => o.id === result.outfitId);
      return { ...result, outfit };
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
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch try-on results" });
  }
};

export const getBatchStatus = async (req: Request, res: Response) => {
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
      return res
        .status(404)
        .json({ success: false, message: "Batch not found" });
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
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch batch status" });
  }
};

export const singleTryOn = async (req: Request, res: Response) => {
  try {
    const { capturedImage, outfitId, userId = 1 } = req.body;
    if (!capturedImage || !outfitId) {
      return res.status(400).json({
        success: false,
        message: "Captured image and outfit ID are required",
      });
    }
    if (!validateBase64Image(capturedImage)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid base64 image format" });
    }
    const outfit = await prisma.outfit.findUnique({
      where: { id: outfitId, isActive: true },
      include: { category: { include: { gender: true } } },
    });
    if (!outfit) {
      return res
        .status(404)
        .json({ success: false, message: "Outfit not found" });
    }
    const userImagePath = await saveBase64ToFile(capturedImage, "user-single");
    const result = await processSingleOutfit(outfit, userImagePath);
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
    res
      .status(500)
      .json({ success: false, message: "Failed to process single outfit try-on" });
  }
};

export const aiSuggestion = async (req: Request, res: Response) => {
  try {
    const { capturedImage, gender, category, userId = 1 } = req.body;
    if (!capturedImage || !gender || !category) {
      return res.status(400).json({
        success: false,
        message: "Captured image, gender, and category are required",
      });
    }
    if (!validateBase64Image(capturedImage)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid base64 image format" });
    }
    const categoryRecord = await prisma.category.findFirst({
      where: { name: category, gender: { name: gender } },
    });
    if (!categoryRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }
    const totalOutfits = await prisma.outfit.count({
      where: { categoryId: categoryRecord.id, isActive: true },
    });
    const randomSkip = Math.floor(
      Math.random() * Math.max(0, totalOutfits - 10)
    );
    const randomOutfits = await prisma.outfit.findMany({
      where: { categoryId: categoryRecord.id, isActive: true },
      skip: randomSkip,
      take: 10,
    });
    if (randomOutfits.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No outfits found in this category" });
    }
    const userImagePath = await saveBase64ToFile(
      capturedImage,
      "ai-suggestion"
    );
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
    res
      .status(500)
      .json({ success: false, message: "Failed to process AI suggestion" });
  }
};

export const getAISuggestionStatus = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const batchRecord = await prisma.batchTryOnResult.findUnique({
      where: { batchId },
    });
    if (!batchRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Batch not found" });
    }
    const allResults = JSON.parse(batchRecord.results);
    const outfitIds = allResults.map((result: any) => result.outfitId);
    const outfits = await prisma.outfit.findMany({
      where: { id: { in: outfitIds } },
    });
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
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch AI suggestion status" });
  }
};

export const multipleTryOn = async (req: Request, res: Response) => {
  try {
    const { capturedImage, outfitIds, userId = 1 } = req.body;
    if (!capturedImage || !outfitIds || outfitIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Captured image and outfit IDs are required",
      });
    }
    if (!validateBase64Image(capturedImage)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid base64 image format" });
    }
    const outfits = await prisma.outfit.findMany({
      where: { id: { in: outfitIds }, isActive: true },
      include: { category: { include: { gender: true } } },
    });
    if (outfits.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No valid outfits found" });
    }
    const userImagePath = await saveBase64ToFile(capturedImage, "multiple");
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
    res
      .status(500)
      .json({ success: false, message: "Failed to start multiple outfits try-on" });
  }
};

export const getMultipleBatchStatus = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const batchRecord = await prisma.batchTryOnResult.findUnique({
      where: { batchId },
    });
    if (!batchRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Batch not found" });
    }
    const allResults = JSON.parse(batchRecord.results);
    const outfitIds = allResults.map((result: any) => result.outfitId);
    const outfits = await prisma.outfit.findMany({
      where: { id: { in: outfitIds } },
    });
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
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch batch status" });
  }
};
