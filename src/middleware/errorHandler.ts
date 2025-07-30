import { Request, Response, NextFunction } from 'express';

interface CustomError extends Error {
  statusCode?: number;
}

export const errorHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('💥 Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Multer errors
  if (err.message === 'Only image files are allowed') {
    return res.status(400).json({
      success: false,
      error: 'Invalid file type. Only image files are allowed.',
      code: 'INVALID_FILE_TYPE'
    });
  }

  if (err.message === 'File too large') {
    return res.status(400).json({
      success: false,
      error: 'File too large. Maximum size is 10MB.',
      code: 'FILE_TOO_LARGE'
    });
  }

  // Prisma errors
  if (err.message.includes('Unique constraint failed')) {
    return res.status(409).json({
      success: false,
      error: 'Resource already exists',
      code: 'DUPLICATE_RESOURCE'
    });
  }

  if (err.message.includes('Record to update not found')) {
    return res.status(404).json({
      success: false,
      error: 'Resource not found',
      code: 'RESOURCE_NOT_FOUND'
    });
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Internal Server Error' : err.message;

  res.status(statusCode).json({
    success: false,
    error: message,
    code: 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details: err.message
    })
  });
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.url} not found`,
    code: 'ROUTE_NOT_FOUND'
  });
};
