# OMS Backend API

Complete Node.js + Express + MongoDB backend for the Order Management System.

## Features

- User authentication with JWT
- Role-based access control
- Product management with variants
- Order management with workflow
- Customer management with credit tracking
- Inventory management with transaction history
- Dashboard statistics

## Tech Stack

- Node.js + Express
- TypeScript
- MongoDB + Mongoose
- JWT Authentication
- bcryptjs for password hashing
- express-validator for validation

## Prerequisites

- Node.js 18+ and npm
- MongoDB 6.0+

## Installation

```bash
# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your settings

# Build the project
npm run build
```

## Running the Server

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm run build
npm start

# Seed database with sample data
npm run seed
```

## Seed Data

The seed script creates:

- **Admin User**
  - Email: admin@oms.com
  - Password: admin123

- **3 Categories**: Groceries, Pulses, Rice & Grains

- **3 Products** with variants:
  - Channa Daal (100g, 500g)
  - Toor Daal (250g)
  - Basmati Rice (1kg, 5kg)

- **3 Customers**:
  - ABC Trading LLC (Business)
  - XYZ Supermarket (Business)
  - Mohammed Ahmed (Individual)

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user

### Products
- `GET /api/products` - List all products
- `GET /api/products/:id` - Get product by ID
- `GET /api/products/sku/:sku` - Get product by SKU
- `POST /api/products` - Create product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product
- `GET /api/products/low-stock` - Get low stock products

### Categories
- `GET /api/categories` - List all categories
- `POST /api/categories` - Create category

### Orders
- `GET /api/orders` - List all orders
- `GET /api/orders/:id` - Get order by ID
- `POST /api/orders` - Create order
- `PUT /api/orders/:id/status` - Update order status

### Customers
- `GET /api/customers` - List all customers
- `GET /api/customers/:id` - Get customer by ID
- `POST /api/customers` - Create customer
- `PUT /api/customers/:id` - Update customer

### Inventory
- `GET /api/inventory/summary` - Get inventory summary
- `GET /api/inventory/transactions` - Get inventory transactions
- `POST /api/inventory/adjust` - Manual inventory adjustment

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

## Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Express middleware
│   ├── models/          # Mongoose models
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── scripts/         # Utility scripts
│   ├── types/           # TypeScript types
│   ├── utils/           # Helper functions
│   └── index.ts         # Entry point
├── .env                 # Environment variables
├── package.json
├── tsconfig.json
└── README.md
```

## Environment Variables

```env
PORT=3002
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/oms
JWT_ACCESS_SECRET=your-access-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:3000
```

## Key Features

### Authentication & Authorization
- JWT-based authentication
- Role-based access control (RBAC)
- Permission-based endpoints
- Refresh token rotation

### Inventory Management
- Automatic stock deduction on order delivery
- Inventory transaction history
- Low stock alerts
- Manual inventory adjustments

### Order Management
- Order workflow with status transitions
- Credit sale support
- Payment tracking
- Order timeline

### Customer Credit Management
- Credit limit tracking
- Outstanding amount calculation
- Credit status management
- Customer ledger

## Development

```bash
# Run in development mode
npm run dev

# Build for production
npm run build

# Run tests (when added)
npm test

# Lint code
npm run lint
```

## API Response Format

Success:
```json
{
  "success": true,
  "data": { ... }
}
```

Error:
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

## License

ISC
# ls_server
