# API Examples

## Authentication

### Login
```bash
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@oms.com",
    "password": "admin123"
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "...",
      "email": "admin@oms.com",
      "firstName": "Admin",
      "lastName": "User",
      "role": "admin"
    },
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "expiresIn": "15m"
  }
}
```

### Get Current User
```bash
curl -X GET http://localhost:3002/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Products

### Get All Products
```bash
curl -X GET "http://localhost:3002/api/products?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Create Product
```bash
curl -X POST http://localhost:3002/api/products \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Premium Sugar",
    "description": "Fine quality white sugar",
    "category": {
      "_id": "CATEGORY_ID",
      "name": "Groceries",
      "path": "Groceries"
    },
    "baseUnit": "kg",
    "variants": [
      {
        "name": "1kg Pack",
        "size": 1,
        "unit": "kg",
        "displaySize": "1kg",
        "price": {
          "basePrice": 4.0,
          "sellingPrice": 5.0,
          "taxRate": 5,
          "taxInclusive": false
        },
        "stock": {
          "quantity": 200,
          "reservedQuantity": 0,
          "availableQuantity": 200,
          "reorderLevel": 30,
          "reorderQuantity": 100
        },
        "status": "active"
      }
    ],
    "status": "active"
  }'
```

### Get Low Stock Products
```bash
curl -X GET http://localhost:3002/api/products/low-stock \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Customers

### Create Customer
```bash
curl -X POST http://localhost:3002/api/customers \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "business",
    "name": "New Trading LLC",
    "companyName": "New Trading LLC",
    "email": "new@trading.com",
    "phone": "+971501234567",
    "addresses": [
      {
        "type": "billing",
        "label": "Main Office",
        "addressLine1": "Business Bay",
        "city": "Dubai",
        "country": "UAE",
        "isDefault": true
      }
    ],
    "creditLimit": 25000,
    "creditTermDays": 30,
    "priceGroup": "wholesale",
    "discountPercent": 3,
    "status": "active"
  }'
```

### Get All Customers
```bash
curl -X GET "http://localhost:3002/api/customers?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Orders

### Create Order
```bash
curl -X POST http://localhost:3002/api/orders \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "CUSTOMER_ID",
    "items": [
      {
        "productId": "PRODUCT_ID",
        "variantId": "VARIANT_ID",
        "sku": "CHANNA-DAAL",
        "variantSku": "CHANNA-DAAL-100G",
        "name": "Channa Daal",
        "variantName": "100g Pack",
        "displaySize": "100g",
        "quantity": 10,
        "unitPrice": 5.0,
        "discountPercent": 0,
        "taxRate": 5
      }
    ],
    "billingAddress": {
      "addressLine1": "Al Maktoum Street",
      "city": "Dubai",
      "country": "UAE"
    },
    "shippingAddress": {
      "addressLine1": "Al Maktoum Street",
      "city": "Dubai",
      "country": "UAE"
    },
    "paymentMethod": "credit"
  }'
```

### Update Order Status
```bash
curl -X PUT http://localhost:3002/api/orders/ORDER_ID/status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "confirmed",
    "notes": "Order confirmed and ready for processing"
  }'
```

### Get All Orders
```bash
curl -X GET "http://localhost:3002/api/orders?page=1&limit=10&status=pending" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Inventory

### Get Inventory Summary
```bash
curl -X GET http://localhost:3002/api/inventory/summary \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Response:
```json
{
  "success": true,
  "data": {
    "totalProducts": 150,
    "totalQuantity": 5420,
    "totalValue": 245000,
    "lowStockCount": 12,
    "outOfStockCount": 3
  }
}
```

### Manual Inventory Adjustment
```bash
curl -X POST http://localhost:3002/api/inventory/adjust \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "PRODUCT_ID",
    "variantId": "VARIANT_ID",
    "quantity": 50,
    "reason": "Stock received from supplier"
  }'
```

### Get Inventory Transactions
```bash
curl -X GET "http://localhost:3002/api/inventory/transactions?productId=PRODUCT_ID&limit=20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Dashboard

### Get Dashboard Stats
```bash
curl -X GET http://localhost:3002/api/dashboard/stats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Response:
```json
{
  "success": true,
  "data": {
    "totalOrders": 156,
    "totalCustomers": 45,
    "totalProducts": 128,
    "monthlyOrders": 23,
    "pendingOrders": 8,
    "lowStockCount": 12,
    "monthlySales": 125000,
    "monthlySalesCount": 23
  }
}
```

## Categories

### Get All Categories
```bash
curl -X GET http://localhost:3002/api/categories \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Create Category
```bash
curl -X POST http://localhost:3002/api/categories \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Spices",
    "slug": "spices",
    "path": "Groceries/Spices",
    "parentId": "PARENT_CATEGORY_ID",
    "level": 1,
    "sortOrder": 3,
    "isActive": true
  }'
```

## Health Check

```bash
curl -X GET http://localhost:3002/api/health
```

Response:
```json
{
  "success": true,
  "message": "OMS API is running",
  "timestamp": "2024-12-14T10:30:00.000Z"
}
```
