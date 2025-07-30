import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Create or get user
export const createOrGetUser = async (req: Request, res: Response) => {
  try {
    const { name, email } = req.body;

    console.log("👤 Creating/getting user:", { name, email });

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Name is required"
      });
    }

    // Check if user exists by email (if provided)
    let existingUser = null;
    if (email) {
      existingUser = await prisma.user.findUnique({
        where: { email }
      });
    }

    if (existingUser) {
      console.log("✅ User already exists:", existingUser.name);
      return res.json({
        success: true,
        message: "User already exists",
        user: existingUser
      });
    }

    // Create new user
    const newUser = await prisma.user.create({
      data: {
        name,
        email: email || null,
        plan: "Free"
      }
    });

    console.log("✅ New user created:", newUser.name);

    res.json({
      success: true,
      message: "User created successfully",
      user: newUser
    });
  } catch (error) {
    console.error("❌ Error creating/getting user:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create/get user",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

// Get user by ID
export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: {
        tryOnResults: {
          include: {
            outfit: true
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    console.log("✅ User found:", user.name);

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error("❌ Error getting user:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get user",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

// Update user
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, plan } = req.body;

    console.log("📝 Updating user:", { id, name, email, plan });

    const updateData: any = {};
    if (name) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (plan) updateData.plan = plan;

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    console.log("✅ User updated:", updatedUser.name);

    res.json({
      success: true,
      message: "User updated successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error("❌ Error updating user:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update user",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

// Get user statistics
export const getUserStats = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    console.log("📊 Getting user statistics for ID:", id);

    const [
      user,
      totalTryOns,
      recentTryOns,
      favoriteOutfitType,
      thisMonthTryOns
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: parseInt(id) }
      }),
      prisma.tryOnResult.count({
        where: { userId: parseInt(id) }
      }),
      prisma.tryOnResult.findMany({
        where: { userId: parseInt(id) },
        include: { outfit: true },
        orderBy: { createdAt: 'desc' },
        take: 5
      }),
      prisma.tryOnResult.groupBy({
        by: ['outfitId'],
        where: { 
          userId: parseInt(id),
          outfit: { isNot: null }
        },
        _count: { outfitId: true },
        orderBy: { _count: { outfitId: 'desc' } },
        take: 1
      }),
      prisma.tryOnResult.count({
        where: {
          userId: parseInt(id),
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        }
      })
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Get favorite outfit details
    let favoriteOutfit = null;
    if (favoriteOutfitType.length > 0) {
      favoriteOutfit = await prisma.outfit.findUnique({
        where: { id: favoriteOutfitType[0].outfitId! }
      });
    }

    const stats = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        memberSince: user.createdAt
      },
      tryOnStats: {
        totalTryOns,
        thisMonthTryOns,
        favoriteOutfit: favoriteOutfit ? {
          ...favoriteOutfit,
          tryOnCount: favoriteOutfitType[0]._count.outfitId
        } : null
      },
      recentTryOns
    };

    console.log(`✅ Statistics generated for user: ${user.name}`);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error("❌ Error getting user statistics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get user statistics",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

// Get all users (admin function)
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const { page = "1", limit = "20" } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { tryOnResults: true }
          }
        }
      }),
      prisma.user.count()
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    console.log(`✅ Retrieved ${users.length} users (page ${pageNum}/${totalPages})`);

    res.json({
      success: true,
      users,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error("❌ Error getting all users:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get users",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};
