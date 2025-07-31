import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import * as tryonController from "../controllers/tryon.controller";

const router = Router();

// Configure multer for file uploads
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

// Middleware to handle process abortion
router.use((req, res, next) => {
  req.on("close", () => {
    // Logic to stop backend processing if needed
  });
  next();
});

// --- New Endpoints ---
router.post(
  "/upload-and-start-base64",
  tryonController.uploadAndStartBase64
);
router.post(
  "/upload-and-start",
  upload.single("userPhoto"),
  tryonController.uploadAndStart
);
router.post("/start", tryonController.startTryOn);
router.get("/results/:batchId", tryonController.getTryOnResults);
router.get("/status/:batchId", tryonController.getBatchStatus);
router.post("/single", tryonController.singleTryOn);
router.post("/ai-suggestion", tryonController.aiSuggestion);
router.get(
  "/ai-suggestion-status/:batchId",
  tryonController.getAISuggestionStatus
);
router.post("/multiple", tryonController.multipleTryOn);
router.get("/batch-status/:batchId", tryonController.getMultipleBatchStatus);

export default router;
