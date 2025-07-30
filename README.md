# AI Mirror Backend

A TypeScript Node.js Express backend for the AI Mirror virtual try-on application with Prisma and FitRoom API integration.

## Features

- 🎯 **Virtual Try-On**: Single and batch outfit try-on using FitRoom API
- 👔 **Outfit Management**: Gender and category-based outfit filtering
- 👤 **User Management**: User creation and try-on history tracking
- 🔄 **Parallel Processing**: Handle multiple outfit try-ons simultaneously
- 📊 **Statistics**: User and outfit analytics
- 🗄️ **Database**: SQLite with Prisma ORM

## Quick Start

### 1. Install Dependencies
```bash
cd ai-mirror-backend
npm install
```

### 2. Setup Database
```bash
# Generate Prisma client
npm run prisma:generate

# Push schema to database
npm run prisma:push

# Seed database with sample outfits
npm run prisma:seed
```

### 3. Start Server
```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

Server will start on **http://localhost:5003**

## API Endpoints

### Virtual Try-On
- `POST /api/tryon/virtual-tryon` - Virtual try-on with user photo
- `GET /api/tryon/batch/:batchId` - Get batch result
- `GET /api/tryon/history/:userId` - Get user history

### Outfits
- `GET /api/outfits` - Get all outfits
- `GET /api/outfits/gender/:gender` - Get outfits by gender (male/female)
- `GET /api/outfits/filter` - Advanced filtering
- `GET /api/outfits/categories` - Get categories
- `GET /api/outfits/stats` - Get statistics
- `GET /api/outfits/:id` - Get outfit by ID

### Users
- `POST /api/users` - Create/get user
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `GET /api/users/:id/stats` - Get user stats

### Health
- `GET /health` - Health check
- `GET /api` - API documentation

## Usage Examples

### 1. Virtual Try-On (Form Data)
```bash
curl -X POST http://localhost:5003/api/tryon/virtual-tryon \
  -F "userPhoto=@user.jpg" \
  -F "selectionMode=all" \
  -F "outfits=[{\"id\":\"1\",\"name\":\"T-Shirt\"}]"
```

### 2. Get Male Outfits
```bash
curl http://localhost:5003/api/outfits/gender/male
```

### 3. Filter Outfits
```bash
curl "http://localhost:5003/api/outfits/filter?gender=female&type=upper&category=t-shirt"
```

### 4. Create User
```bash
curl -X POST http://localhost:5003/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com"}'
```

## Database Schema

### Outfit Categories
- **Gender**: male, female
- **Type**: upper, lower, fullbody
- **Category**: t-shirt, shirts, traditional, modern, jeans, pants, dress, suit

### Sample Data
The seed script creates 16 sample outfits across different categories:
- 8 Male outfits (t-shirts, shirts, jeans, pants, suits)
- 8 Female outfits (t-shirts, shirts, dresses, traditional wear)

## Environment Variables

Create `.env` file:
```env
DATABASE_URL="file:./dev.db"
PORT=5003
FITROOM_API_KEY="your-fitroom-api-key"
FITROOM_API_URL="https://platform.fitroom.app/api/tryon/v2/tasks"
FITROOM_UPLOAD_URL="https://platform.fitroom.app/api/tryon/image/upload"
```

## Project Structure

```
ai-mirror-backend/
├── src/
│   ├── controllers/
│   │   ├── tryOn.controller.ts    # Virtual try-on logic
│   │   ├── outfit.controller.ts   # Outfit filtering
│   │   └── user.controller.ts     # User management
│   ├── routes/
│   │   ├── tryOn.routes.ts
│   │   ├── outfit.routes.ts
│   │   ├── user.routes.ts
│   │   └── index.ts
│   ├── middleware/
│   │   ├── cors.ts
│   │   └── errorHandler.ts
│   └── server.ts
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── temp/                          # Temporary file storage
├── package.json
└── README.md
```

## FitRoom API Integration

The backend integrates with FitRoom API for virtual try-on:
- Supports parallel processing of multiple outfits
- Handles image upload and processing
- Polls for results and manages task status
- Cleans up temporary files automatically

## Development

### Database Management
```bash
# View database
npm run prisma:studio

# Reset database
npm run prisma:push --force-reset
npm run prisma:seed
```

### Testing
- Health check: http://localhost:5003/health
- API docs: http://localhost:5003/api
- Database viewer: http://localhost:5555 (after running prisma studio)

## Production Deployment

1. Set environment variables
2. Run database migrations
3. Build and start server:
```bash
npm run build
npm start
```

## License

MIT License
