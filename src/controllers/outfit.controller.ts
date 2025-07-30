import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class OutfitController {
  // GET /api/outfits/genders - Get all genders with banner images
  static async getGenders(req: Request, res: Response) {
    try {
      const genders = await prisma.gender.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          displayName: true,
          bannerImage: true
        }
      });

      res.json({
        success: true,
        data: genders
      });
    } catch (error) {
      console.error('Error fetching genders:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch genders'
      });
    }
  }

  // GET /api/outfits/categories/:genderName - Get categories for a gender
  static async getCategories(req: Request, res: Response) {
    try {
      const { genderName } = req.params;

      const gender = await prisma.gender.findUnique({
        where: { name: genderName },
        include: {
          categories: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              displayName: true,
              bannerImage: true,
              _count: {
                select: { outfits: true }
              }
            }
          }
        }
      });

      if (!gender) {
        return res.status(404).json({
          success: false,
          message: 'Gender not found'
        });
      }

      res.json({
        success: true,
        data: {
          gender: {
            id: gender.id,
            name: gender.name,
            displayName: gender.displayName,
            bannerImage: gender.bannerImage
          },
          categories: gender.categories
        }
      });
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch categories'
      });
    }
  }

  // GET /api/outfits/:genderName/:categoryName - Get outfits with pagination and price filtering
  static async getOutfits(req: Request, res: Response) {
    try {
      const { genderName, categoryName } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 9;
      const minPrice = req.query.minPrice ? parseInt(req.query.minPrice as string) : undefined;
      const maxPrice = req.query.maxPrice ? parseInt(req.query.maxPrice as string) : undefined;
      const offset = (page - 1) * limit;

      // Get category with gender filter
      const category = await prisma.category.findFirst({
        where: {
          name: categoryName,
          gender: { name: genderName },
          isActive: true
        },
        include: {
          gender: true
        }
      });

      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Category not found'
        });
      }

      // Build price filter
      const priceFilter: any = {};
      if (minPrice !== undefined) priceFilter.gte = minPrice;
      if (maxPrice !== undefined) priceFilter.lte = maxPrice;

      const whereClause: any = {
        categoryId: category.id,
        isActive: true
      };

      if (Object.keys(priceFilter).length > 0) {
        whereClause.price = priceFilter;
      }

      // Get outfits with pagination and price filtering
      const [outfits, totalCount] = await Promise.all([
        prisma.outfit.findMany({
          where: whereClause,
          select: {
            id: true,
            name: true,
            imageUrl: true,
            description: true,
            clothType: true,
            price: true
          },
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.outfit.count({
          where: whereClause
        })
      ]);

      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      res.json({
        success: true,
        data: {
          outfits,
          pagination: {
            currentPage: page,
            totalPages,
            totalCount,
            limit,
            hasNextPage,
            hasPrevPage
          },
          category: {
            id: category.id,
            name: category.name,
            displayName: category.displayName,
            bannerImage: category.bannerImage
          },
          gender: {
            name: category.gender.name,
            displayName: category.gender.displayName
          },
          filters: {
            minPrice,
            maxPrice
          }
        }
      });
    } catch (error) {
      console.error('Error fetching outfits:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch outfits'
      });
    }
  }

  // GET /api/outfits/outfit/:id - Get single outfit details
  static async getOutfitById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const outfit = await prisma.outfit.findUnique({
        where: { id: parseInt(id) },
        include: {
          category: {
            include: {
              gender: true
            }
          }
        }
      });

      if (!outfit) {
        return res.status(404).json({
          success: false,
          message: 'Outfit not found'
        });
      }

      res.json({
        success: true,
        data: outfit
      });
    } catch (error) {
      console.error('Error fetching outfit:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch outfit'
      });
    }
  }

  // GET /api/outfits/price-range/:categoryName - Get price range for a category
  static async getPriceRange(req: Request, res: Response) {
    try {
      const { categoryName } = req.params;

      const priceStats = await prisma.outfit.aggregate({
        where: {
          category: { name: categoryName },
          isActive: true
        },
        _min: { price: true },
        _max: { price: true }
      });

      res.json({
        success: true,
        data: {
          minPrice: priceStats._min.price || 0,
          maxPrice: priceStats._max.price || 0
        }
      });
    } catch (error) {
      console.error('Error fetching price range:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch price range'
      });
    }
  }
}
