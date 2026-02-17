import mongoose from 'mongoose';
import { config } from '../config';
import User from '../models/User';
import Category from '../models/Category';
import Product from '../models/Product';
import Customer from '../models/Customer';
import Order from '../models/Order';
import InventoryTransaction from '../models/InventoryTransaction';
import { AuthService } from '../services/auth.service';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

async function seed() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(config.mongoUri);
    console.log('Connected to database');

    // Clear existing data
    console.log('Clearing existing data...');
    await Promise.all([
      User.deleteMany({}),
      Category.deleteMany({}),
      Product.deleteMany({}),
      Customer.deleteMany({}),
      Order.deleteMany({}),
      InventoryTransaction.deleteMany({}),
    ]);

    // ========================================
    // CREATE USERS
    // ========================================
    console.log('Creating users...');
    const { hash: adminHash, salt: adminSalt } = await AuthService.hashPassword('admin123');
    const { hash: userHash, salt: userSalt } = await AuthService.hashPassword('password123');

    const users = await User.insertMany([
      {
        employeeId: 'EMP-001',
        email: 'sa@oms.com',
        passwordHash: adminHash,
        passwordSalt: adminSalt,
        firstName: 'Super',
        lastName: 'Admin',
        fullName: 'Super Admin',
        phone: '+971501234567',
        role: 'super_admin',
        status: 'active',
        department: 'Administration',
        refreshTokens: [],
        preferences: { theme: 'light', language: 'en' },
      },
      {
        employeeId: 'EMP-002',
        email: 'admin@oms.com',
        passwordHash: userHash,
        passwordSalt: userSalt,
        firstName: 'Admin',
        lastName: 'User',
        fullName: 'Admin User',
        phone: '+971502345678',
        role: 'admin',
        status: 'active',
        department: 'Administration',
        refreshTokens: [],
        preferences: { theme: 'light', language: 'en' },
      },
      {
        employeeId: 'EMP-003',
        email: 'hod@oms.com',
        passwordHash: userHash,
        passwordSalt: userSalt,
        firstName: 'Sarah',
        lastName: 'Johnson',
        fullName: 'Sarah Johnson',
        phone: '+971503456789',
        role: 'hod',
        status: 'active',
        department: 'Operations',
        refreshTokens: [],
        preferences: { theme: 'dark', language: 'en' },
      },
      {
        employeeId: 'EMP-004',
        email: 'accountant@oms.com',
        passwordHash: userHash,
        passwordSalt: userSalt,
        firstName: 'Fatima',
        lastName: 'Al Zahra',
        fullName: 'Fatima Al Zahra',
        phone: '+971504567890',
        role: 'accountant',
        status: 'active',
        department: 'Finance',
        refreshTokens: [],
        preferences: { theme: 'light', language: 'en' },
      },
      {
        employeeId: 'EMP-005',
        email: 'supervisor@oms.com',
        passwordHash: userHash,
        passwordSalt: userSalt,
        firstName: 'Raj',
        lastName: 'Kumar',
        fullName: 'Raj Kumar',
        phone: '+971505678901',
        role: 'supervisor',
        status: 'active',
        department: 'Operations',
        refreshTokens: [],
        preferences: { theme: 'light', language: 'en' },
      },
      {
        employeeId: 'EMP-006',
        email: 'sales@oms.com',
        passwordHash: userHash,
        passwordSalt: userSalt,
        firstName: 'Ahmed',
        lastName: 'Hassan',
        fullName: 'Ahmed Hassan',
        phone: '+971506789012',
        role: 'sales_team',
        status: 'active',
        department: 'Sales',
        territories: ['Dubai', 'Sharjah'],
        refreshTokens: [],
        preferences: { theme: 'light', language: 'ar' },
      },
      {
        employeeId: 'EMP-007',
        email: 'delivery@oms.com',
        passwordHash: userHash,
        passwordSalt: userSalt,
        firstName: 'Mohammed',
        lastName: 'Ali',
        fullName: 'Mohammed Ali',
        phone: '+971507890123',
        role: 'delivery_team',
        status: 'active',
        department: 'Logistics',
        refreshTokens: [],
        preferences: { theme: 'dark', language: 'ar' },
      },
      {
        employeeId: 'EMP-008',
        email: 'hrm@oms.com',
        passwordHash: userHash,
        passwordSalt: userSalt,
        firstName: 'Aisha',
        lastName: 'Khan',
        fullName: 'Aisha Khan',
        phone: '+971508901234',
        role: 'hrm',
        status: 'active',
        department: 'Human Resources',
        refreshTokens: [],
        preferences: { theme: 'light', language: 'en' },
      },
    ]);

    const admin = users[0];
    console.log(`Created ${users.length} users`);

    // ========================================
    // CREATE CATEGORIES
    // ========================================
    console.log('Creating categories...');

    const rootCategory = await Category.create({
      name: 'Suvai',
      slug: 'suvai',
      description: 'Suvai product catalog',
      path: 'Suvai',
      pathIds: [],
      level: 0,
      sortOrder: 1,
      isActive: true,
      productCount: 0,
    });

    const suvaiSubcategoriesData = [
      { name: 'Suvai Pulses & Beans', code: 'PB' },
      { name: 'Suvai Spices Powder', code: 'SP' },
      { name: 'Suvai Spices Whole', code: 'SW' },
      { name: 'Suvai Assorted Powder', code: 'AP' },
      { name: 'Suvai Assorted Whole', code: 'AW' },
      { name: 'Suvai Chakki Atta/Maida', code: 'AM' },
      { name: 'Suvai Dry Fruits', code: 'DF' },
      { name: 'Suvai Rice', code: 'RC' },
      { name: 'Suvai Sugar', code: 'SR' },
      { name: 'Suvai Oil', code: 'SO' },
    ];

    const suvaiSubcategories = await Category.insertMany(
      suvaiSubcategoriesData.map((item, index) => ({
        name: item.name,
        slug: `suvai-${slugify(item.code)}`,
        description: item.name,
        parentId: rootCategory._id,
        path: `Suvai/${item.name}`,
        pathIds: [rootCategory._id],
        level: 1,
        sortOrder: index + 1,
        isActive: true,
        productCount: 0,
      }))
    );

    const allCategories = [rootCategory, ...suvaiSubcategories];
    console.log(`Created ${allCategories.length} categories`);

    // ========================================
    // CREATE PRODUCTS
    // ========================================
    console.log('Creating products...');

    const roundToTwo = (value: number) => Math.round(value * 100) / 100;
    const buildSku = (name: string) => slugify(name).toUpperCase().replace(/-/g, '-');

    const pulsesCategory = suvaiSubcategories.find((item) => item.name === 'Suvai Pulses & Beans')!;
    const suvaiBrand = { _id: new mongoose.Types.ObjectId(), name: 'Suvai' };

    const productRows = [
      { name: 'Black Chana / chickpeas', barcode: '629782589185', size: 400, price: 2.1 },
      { name: 'Black Chana / chickpeas', barcode: '629782890090', size: 800, price: 4.0 },
      { name: 'Black Eye Beans', barcode: '629782153324', size: 400, price: 2.75 },
      { name: 'Black Eye Beans', barcode: '629782124317', size: 800, price: 5.25 },
      { name: 'Broad Beans', barcode: '629782504942', size: 400, price: 6.95 },
      { name: 'Chana Dal', barcode: '629782533355', size: 400, price: 2.5 },
      { name: 'Chana Dal', barcode: '629782759632', size: 800, price: 4.75 },
      { name: 'Flex Seed', barcode: '629782756372', size: 400, price: 3.75 },
      { name: 'Foul Split', barcode: '629782903015', size: 400, price: 2.75 },
      { name: 'Foul Split', barcode: '629782955904', size: 800, price: 5.25 },
      { name: 'Green Lentil', barcode: '629782003445', size: 400, price: 3.25 },
      { name: 'Green Lentil', barcode: '629782058308', size: 800, price: 6.25 },
      { name: 'Green Peas - Dry', barcode: '629782219006', size: 400, price: 1.65 },
      { name: 'Green Peas - Dry', barcode: '629782291200', size: 800, price: 3.2 },
      { name: 'Horse Gram', barcode: '629782462341', size: 400, price: 2.5 },
      { name: 'Masoor Dal', barcode: '629782582537', size: 400, price: 2.4 },
      { name: 'Masoor Dal', barcode: '629782166041', size: 800, price: 4.5 },
      { name: 'Masoor Gota', barcode: '629782082525', size: 400, price: 2.75 },
      { name: 'Masoor Gota', barcode: '629782983549', size: 800, price: 5.4 },
      { name: 'Matar Dal', barcode: '629782936989', size: 400, price: 1.6 },
      { name: 'Matar Dal', barcode: '629782361804', size: 800, price: 3.25 },
      { name: 'Mix Dal', barcode: '629782886703', size: 400, price: 2.95 },
      { name: 'Moong Dal', barcode: '629782281607', size: 400, price: 2.95 },
      { name: 'Moong Dal', barcode: '629782201803', size: 800, price: 5.5 },
      { name: 'Moong Split', barcode: '629782521352', size: 400, price: 2.75 },
      { name: 'Moong Split', barcode: '629782048651', size: 800, price: 5.5 },
      { name: 'Moong Whole', barcode: '629782816526', size: 400, price: 2.6 },
      { name: 'Moong Whole', barcode: '629782452359', size: 800, price: 4.95 },
      { name: 'Red Chowly', barcode: '629782039208', size: 400, price: 3.0 },
      { name: 'Red Chowly', barcode: '629782188692', size: 800, price: 5.75 },
      { name: 'Red Kidney Beans', barcode: '629782275668', size: 400, price: 4.5 },
      { name: 'Red Kidney Beans', barcode: '629782247887', size: 800, price: 8.75 },
      { name: 'Red Masoor Whole', barcode: '629782119368', size: 400, price: 2.25 },
      { name: 'Red Masoor Whole', barcode: '629782045162', size: 800, price: 4.25 },
      { name: 'Toor Dal', barcode: '629782839181', size: 400, price: 3.5 },
      { name: 'Toor Dal', barcode: '629782671019', size: 800, price: 6.9 },
      { name: 'Urad Dal', barcode: '629782866101', size: 400, price: 3.4 },
      { name: 'Urad Dal', barcode: '629782899536', size: 800, price: 6.6 },
      { name: 'Urad Gota', barcode: '629782042635', size: 400, price: 3.25 },
      { name: 'Urad Gota', barcode: '629782532693', size: 800, price: 6.5 },
      { name: 'Urad Split', barcode: '629782643177', size: 400, price: 3.0 },
      { name: 'Urad Split', barcode: '629782407557', size: 800, price: 5.75 },
      { name: 'Urad Whole', barcode: '629782262613', size: 400, price: 3.0 },
      { name: 'Urad Whole', barcode: '629782821636', size: 800, price: 5.75 },
      { name: 'White chickpeas / Chana 12 mm', barcode: '629782623308', size: 400, price: 4.0 },
      { name: 'White chickpeas / Chana 12 mm', barcode: '629782673105', size: 800, price: 7.5 },
      { name: 'White chickpeas / Chana 9 mm', barcode: '629782119580', size: 400, price: 3.1 },
      { name: 'White chickpeas / Chana 9 mm', barcode: '629782842570', size: 800, price: 6.0 },
      { name: 'White kidney Beans', barcode: '629782339162', size: 400, price: 3.5 },
      { name: 'White kidney Beans', barcode: '629782452427', size: 800, price: 6.75 },
      { name: 'Yellow Masoor Dal', barcode: '629782367981', size: 400, price: 3.95 },
      { name: 'Yellow Masoor Dal', barcode: '629782940757', size: 800, price: 7.6 },
    ];

    const groupedProducts = productRows.reduce<Record<string, any>>((acc, row) => {
      if (!acc[row.name]) {
        acc[row.name] = {
          name: row.name,
          variants: [],
        };
      }
      acc[row.name].variants.push(row);
      return acc;
    }, {});

    const products = await Product.insertMany(
      Object.values(groupedProducts).map((product: any) => {
        const sku = buildSku(product.name);
        return {
          sku,
          name: product.name,
          description: product.name,
          category: {
            _id: pulsesCategory._id,
            name: pulsesCategory.name,
            path: pulsesCategory.path,
          },
          brand: suvaiBrand,
          baseUnit: 'g',
          images: [],
          tags: ['suvai', 'pulses'],
          attributes: { origin: 'UAE' },
          variants: product.variants.map((variant: any) => ({
            variantSku: `${sku}-${variant.size}G`,
            name: `${variant.size}g Pack`,
            size: variant.size,
            unit: 'g',
            displaySize: `${variant.size}g`,
            barcode: variant.barcode,
            price: {
              basePrice: roundToTwo(variant.price * 0.75),
              sellingPrice: variant.price,
              taxRate: 5,
              taxInclusive: false,
            },
            stock: {
              quantity: variant.size === 400 ? 240 : 160,
              reservedQuantity: 0,
              availableQuantity: variant.size === 400 ? 240 : 160,
              reorderLevel: variant.size === 400 ? 48 : 32,
              reorderQuantity: variant.size === 400 ? 192 : 128,
            },
            status: 'active',
            weight: variant.size + 20,
          })),
          status: 'active',
          createdBy: admin._id,
          updatedBy: admin._id,
        };
      })
    );

    console.log(`Created ${products.length} products`);

    // ========================================
    // CREATE CUSTOMERS
    // ========================================
    console.log('Creating customers...');

    const customers = await Customer.insertMany([
      {
        customerCode: 'CUST-00001',
        type: 'business',
        name: 'Al Madina Trading LLC',
        companyName: 'Al Madina Trading LLC',
        tradeLicenseNo: 'TL-123456',
        taxRegistrationNo: 'TRN100234567890',
        email: 'procurement@almadinatrading.ae',
        phone: '+971501111111',
        alternatePhone: '+97142223333',
        addresses: [
          {
            type: 'billing',
            label: 'Head Office',
            addressLine1: 'Building 45, Al Maktoum Street',
            addressLine2: 'Near Clock Tower',
            city: 'Dubai',
            state: 'Dubai',
            country: 'UAE',
            postalCode: '12345',
            isDefault: true,
            contactPerson: 'Mr. Ahmed Hassan',
            contactPhone: '+971501111111',
          },
          {
            type: 'shipping',
            label: 'Warehouse',
            addressLine1: 'Warehouse 12, Industrial Area 4',
            city: 'Sharjah',
            state: 'Sharjah',
            country: 'UAE',
            postalCode: '45678',
            isDefault: true,
            contactPerson: 'Mr. Raj',
            contactPhone: '+971509999888',
          },
        ],
        creditInfo: {
          creditLimit: 100000,
          currentOutstanding: 15000,
          availableCredit: 85000,
          creditTermDays: 45,
          creditStatus: 'active',
          creditScore: 85,
          riskCategory: 'low',
        },
        financialSummary: {
          totalOrders: 156,
          totalOrderValue: 450000,
          totalPaidAmount: 435000,
          totalOutstanding: 15000,
          overdueAmount: 0,
          averageOrderValue: 2885,
          averagePaymentDays: 38,
        },
        priceGroup: 'wholesale',
        discountPercent: 8,
        status: 'active',
        assignedSalesRep: users[2]._id,
        territory: 'Dubai',
        preferences: {
          preferredPaymentMethod: 'bank_transfer',
          preferredDeliveryTime: 'Morning (9AM-12PM)',
          communicationPreference: 'email',
          language: 'en',
        },
        notes: [
          {
            note: 'VIP customer - priority delivery',
            createdBy: admin._id,
            createdAt: new Date(),
          },
        ],
        createdBy: admin._id,
        updatedBy: admin._id,
      },
      {
        customerCode: 'CUST-00002',
        type: 'business',
        name: 'Gulf Star Supermarket',
        companyName: 'Gulf Star Supermarket LLC',
        tradeLicenseNo: 'TL-234567',
        taxRegistrationNo: 'TRN100345678901',
        email: 'orders@gulfstar.ae',
        phone: '+971502222222',
        addresses: [
          {
            type: 'billing',
            label: 'Store',
            addressLine1: 'Shop 15, Al Barsha Mall',
            city: 'Dubai',
            state: 'Dubai',
            country: 'UAE',
            postalCode: '23456',
            isDefault: true,
            contactPerson: 'Ms. Fatima',
            contactPhone: '+971502222222',
          },
        ],
        creditInfo: {
          creditLimit: 50000,
          currentOutstanding: 8500,
          availableCredit: 41500,
          creditTermDays: 30,
          creditStatus: 'active',
          creditScore: 78,
          riskCategory: 'low',
        },
        financialSummary: {
          totalOrders: 89,
          totalOrderValue: 185000,
          totalPaidAmount: 176500,
          totalOutstanding: 8500,
          overdueAmount: 2000,
          averageOrderValue: 2078,
          averagePaymentDays: 28,
        },
        priceGroup: 'retail',
        discountPercent: 5,
        status: 'active',
        assignedSalesRep: users[2]._id,
        territory: 'Dubai',
        preferences: {
          preferredPaymentMethod: 'credit',
          preferredDeliveryTime: 'Afternoon (2PM-5PM)',
          communicationPreference: 'whatsapp',
          language: 'ar',
        },
        notes: [],
        createdBy: admin._id,
        updatedBy: admin._id,
      },
      {
        customerCode: 'CUST-00003',
        type: 'business',
        name: 'Oasis Grocery Store',
        companyName: 'Oasis Grocery Store',
        email: 'oasisgrocery@email.com',
        phone: '+971503333333',
        addresses: [
          {
            type: 'billing',
            label: 'Shop',
            addressLine1: 'Shop 5, Al Nahda Building',
            city: 'Sharjah',
            state: 'Sharjah',
            country: 'UAE',
            isDefault: true,
          },
        ],
        creditInfo: {
          creditLimit: 25000,
          currentOutstanding: 12000,
          availableCredit: 13000,
          creditTermDays: 30,
          creditStatus: 'active',
          creditScore: 65,
          riskCategory: 'medium',
        },
        financialSummary: {
          totalOrders: 45,
          totalOrderValue: 78000,
          totalPaidAmount: 66000,
          totalOutstanding: 12000,
          overdueAmount: 5000,
          averageOrderValue: 1733,
          averagePaymentDays: 35,
        },
        priceGroup: 'retail',
        discountPercent: 3,
        status: 'active',
        assignedSalesRep: users[2]._id,
        territory: 'Sharjah',
        notes: [
          {
            note: 'Has overdue payments - follow up required',
            createdBy: users[5]._id,
            createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        ],
        createdBy: admin._id,
        updatedBy: admin._id,
      },
      {
        customerCode: 'CUST-00004',
        type: 'business',
        name: 'Royal Food Services',
        companyName: 'Royal Food Services LLC',
        tradeLicenseNo: 'TL-345678',
        taxRegistrationNo: 'TRN100456789012',
        email: 'supply@royalfood.ae',
        phone: '+971504444444',
        alternatePhone: '+97143334444',
        addresses: [
          {
            type: 'billing',
            label: 'Office',
            addressLine1: 'Office 301, Business Bay Tower',
            city: 'Dubai',
            state: 'Dubai',
            country: 'UAE',
            postalCode: '34567',
            isDefault: true,
            contactPerson: 'Mr. Khan',
            contactPhone: '+971504444444',
          },
          {
            type: 'shipping',
            label: 'Kitchen 1',
            addressLine1: 'Kitchen Unit 5, Al Quoz Industrial',
            city: 'Dubai',
            country: 'UAE',
            isDefault: false,
          },
          {
            type: 'shipping',
            label: 'Kitchen 2',
            addressLine1: 'Kitchen Unit 12, JLT Cluster C',
            city: 'Dubai',
            country: 'UAE',
            isDefault: true,
          },
        ],
        creditInfo: {
          creditLimit: 75000,
          currentOutstanding: 22000,
          availableCredit: 53000,
          creditTermDays: 30,
          creditStatus: 'active',
          creditScore: 82,
          riskCategory: 'low',
        },
        financialSummary: {
          totalOrders: 234,
          totalOrderValue: 520000,
          totalPaidAmount: 498000,
          totalOutstanding: 22000,
          overdueAmount: 0,
          averageOrderValue: 2222,
          averagePaymentDays: 25,
        },
        priceGroup: 'wholesale',
        discountPercent: 10,
        status: 'active',
        assignedSalesRep: users[2]._id,
        territory: 'Dubai',
        preferences: {
          preferredPaymentMethod: 'bank_transfer',
          preferredDeliveryTime: 'Early Morning (6AM-9AM)',
          communicationPreference: 'email',
          language: 'en',
        },
        notes: [
          {
            note: 'B2B catering company - bulk orders',
            createdBy: admin._id,
            createdAt: new Date(),
          },
        ],
        createdBy: admin._id,
        updatedBy: admin._id,
      },
      {
        customerCode: 'CUST-00005',
        type: 'individual',
        name: 'Mohammed Al Rashid',
        email: 'mohammed.rashid@email.com',
        phone: '+971505555555',
        addresses: [
          {
            type: 'billing',
            label: 'Home',
            addressLine1: 'Villa 25, Al Barsha 2',
            city: 'Dubai',
            country: 'UAE',
            isDefault: true,
          },
        ],
        creditInfo: {
          creditLimit: 10000,
          currentOutstanding: 0,
          availableCredit: 10000,
          creditTermDays: 15,
          creditStatus: 'active',
          creditScore: 70,
          riskCategory: 'low',
        },
        financialSummary: {
          totalOrders: 23,
          totalOrderValue: 12500,
          totalPaidAmount: 12500,
          totalOutstanding: 0,
          overdueAmount: 0,
          averageOrderValue: 543,
          averagePaymentDays: 0,
        },
        priceGroup: 'retail',
        discountPercent: 0,
        status: 'active',
        territory: 'Dubai',
        preferences: {
          preferredPaymentMethod: 'card',
          communicationPreference: 'sms',
          language: 'ar',
        },
        notes: [],
        createdBy: admin._id,
        updatedBy: admin._id,
      },
      {
        customerCode: 'CUST-00006',
        type: 'business',
        name: 'Emirates Fresh Market',
        companyName: 'Emirates Fresh Market LLC',
        tradeLicenseNo: 'TL-456789',
        email: 'buying@emiratesfresh.ae',
        phone: '+971506666666',
        addresses: [
          {
            type: 'billing',
            label: 'Main Store',
            addressLine1: 'Ground Floor, Emirates Mall',
            city: 'Abu Dhabi',
            state: 'Abu Dhabi',
            country: 'UAE',
            postalCode: '45678',
            isDefault: true,
          },
        ],
        creditInfo: {
          creditLimit: 150000,
          currentOutstanding: 45000,
          availableCredit: 105000,
          creditTermDays: 60,
          creditStatus: 'active',
          creditScore: 90,
          riskCategory: 'low',
        },
        financialSummary: {
          totalOrders: 312,
          totalOrderValue: 890000,
          totalPaidAmount: 845000,
          totalOutstanding: 45000,
          overdueAmount: 0,
          averageOrderValue: 2853,
          averagePaymentDays: 45,
        },
        priceGroup: 'wholesale',
        discountPercent: 12,
        status: 'active',
        territory: 'Abu Dhabi',
        preferences: {
          preferredPaymentMethod: 'bank_transfer',
          preferredDeliveryTime: 'Morning (9AM-12PM)',
          communicationPreference: 'email',
          language: 'en',
        },
        notes: [
          {
            note: 'Key account - premium customer',
            createdBy: admin._id,
            createdAt: new Date(),
          },
        ],
        createdBy: admin._id,
        updatedBy: admin._id,
      },
      {
        customerCode: 'CUST-00007',
        type: 'business',
        name: 'Quick Mart',
        companyName: 'Quick Mart Trading',
        email: 'quickmart@email.com',
        phone: '+971507777777',
        addresses: [
          {
            type: 'billing',
            label: 'Store',
            addressLine1: 'Shop 8, Ajman City Centre',
            city: 'Ajman',
            state: 'Ajman',
            country: 'UAE',
            isDefault: true,
          },
        ],
        creditInfo: {
          creditLimit: 15000,
          currentOutstanding: 15000,
          availableCredit: 0,
          creditTermDays: 15,
          creditStatus: 'suspended',
          creditScore: 45,
          riskCategory: 'high',
        },
        financialSummary: {
          totalOrders: 28,
          totalOrderValue: 42000,
          totalPaidAmount: 27000,
          totalOutstanding: 15000,
          overdueAmount: 15000,
          averageOrderValue: 1500,
          averagePaymentDays: 55,
        },
        priceGroup: 'retail',
        discountPercent: 0,
        status: 'active',
        territory: 'Ajman',
        notes: [
          {
            note: 'Credit suspended due to overdue payments',
            createdBy: users[5]._id,
            createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
          },
        ],
        createdBy: admin._id,
        updatedBy: admin._id,
      },
      {
        customerCode: 'CUST-00008',
        type: 'individual',
        name: 'Sarah Johnson',
        email: 'sarah.j@email.com',
        phone: '+971508888888',
        addresses: [
          {
            type: 'billing',
            label: 'Home',
            addressLine1: 'Apt 1205, Marina Tower',
            city: 'Dubai',
            country: 'UAE',
            isDefault: true,
          },
        ],
        creditInfo: {
          creditLimit: 5000,
          currentOutstanding: 0,
          availableCredit: 5000,
          creditTermDays: 7,
          creditStatus: 'active',
          riskCategory: 'low',
        },
        financialSummary: {
          totalOrders: 8,
          totalOrderValue: 2800,
          totalPaidAmount: 2800,
          totalOutstanding: 0,
          overdueAmount: 0,
        },
        priceGroup: 'retail',
        discountPercent: 0,
        status: 'active',
        preferences: {
          preferredPaymentMethod: 'card',
          communicationPreference: 'email',
          language: 'en',
        },
        notes: [],
        createdBy: admin._id,
        updatedBy: admin._id,
      },
    ]);

    console.log(`Created ${customers.length} customers`);

    // ========================================
    // CREATE SAMPLE ORDERS
    // ========================================
    console.log('Creating sample orders...');

    const orderStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
    const orders: any[] = [];
    const inventoryTransactions: any[] = [];
    const stockAdjustments = new Map<string, { productId: any; variantId: any; quantity: number; variantSku: string }>();
    const stockSnapshot = new Map<string, number>();

    // Generate orders for the last 30 days
    for (let i = 0; i < 25; i++) {
      const randomCustomer = customers[Math.floor(Math.random() * customers.length)];
      const randomProduct1 = products[Math.floor(Math.random() * products.length)];
      const randomProduct2 = products[Math.floor(Math.random() * products.length)];
      const randomStatus = orderStatuses[Math.floor(Math.random() * orderStatuses.length)];
      const daysAgo = Math.floor(Math.random() * 30);
      const orderDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      const orderId = new mongoose.Types.ObjectId();

      const variant1 = randomProduct1.variants[0] as any;
      const variant2 = randomProduct2.variants[0] as any;
      const qty1 = Math.floor(Math.random() * 10) + 1;
      const qty2 = Math.floor(Math.random() * 5) + 1;

      const lineTotal1 = variant1.price.sellingPrice * qty1;
      const lineTotal2 = variant2.price.sellingPrice * qty2;
      const subtotal = lineTotal1 + lineTotal2;
      const taxTotal = subtotal * 0.05;
      const grandTotal = subtotal + taxTotal;

      const isDelivered = randomStatus === 'delivered';

      const item1TransactionId = isDelivered ? new mongoose.Types.ObjectId() : undefined;
      const item2TransactionId = isDelivered ? new mongoose.Types.ObjectId() : undefined;

      orders.push({
        _id: orderId,
        orderNumber: `ORD-2024-${String(i + 1).padStart(5, '0')}`,
        customerId: randomCustomer._id,
        customerCode: randomCustomer.customerCode,
        customerName: randomCustomer.name,
        customerEmail: randomCustomer.email,
        customerPhone: randomCustomer.phone,
        orderType: 'sales',
        orderSource: ['web', 'mobile', 'phone'][Math.floor(Math.random() * 3)],
        billingAddress: randomCustomer.addresses[0],
        shippingAddress: randomCustomer.addresses[0],
        items: [
          {
            productId: randomProduct1._id,
            variantId: variant1._id,
            sku: randomProduct1.sku,
            variantSku: variant1.variantSku,
            name: randomProduct1.name,
            variantName: variant1.name,
            displaySize: variant1.displaySize,
            quantity: qty1,
            unitPrice: variant1.price.sellingPrice,
            discountPercent: 0,
            discountAmount: 0,
            taxRate: 5,
            taxAmount: lineTotal1 * 0.05,
            lineTotal: lineTotal1 * 1.05,
            inventoryDeducted: isDelivered,
            inventoryTransactionId: item1TransactionId,
          },
          {
            productId: randomProduct2._id,
            variantId: variant2._id,
            sku: randomProduct2.sku,
            variantSku: variant2.variantSku,
            name: randomProduct2.name,
            variantName: variant2.name,
            displaySize: variant2.displaySize,
            quantity: qty2,
            unitPrice: variant2.price.sellingPrice,
            discountPercent: 0,
            discountAmount: 0,
            taxRate: 5,
            taxAmount: lineTotal2 * 0.05,
            lineTotal: lineTotal2 * 1.05,
            inventoryDeducted: isDelivered,
            inventoryTransactionId: item2TransactionId,
          },
        ],
        pricing: {
          subtotal,
          itemDiscountTotal: 0,
          orderDiscount: { type: 'percent', value: 0, amount: 0 },
          taxTotal,
          shippingCharge: 0,
          shippingDiscount: 0,
          grandTotal,
          roundingAdjustment: 0,
        },
        paymentStatus: isDelivered ? 'paid' : 'pending',
        paymentMethod: randomCustomer.type === 'business' ? 'credit' : 'cod',
        paidAmount: isDelivered ? grandTotal : 0,
        balanceDue: isDelivered ? 0 : grandTotal,
        payments: isDelivered ? [{
          amount: grandTotal,
          method: 'bank_transfer',
          reference: `PAY-${Date.now()}`,
          paidAt: new Date(),
          receivedBy: users[5]._id,
        }] : [],
        creditInfo: {
          isCreditSale: randomCustomer.type === 'business',
          creditDays: randomCustomer.creditInfo.creditTermDays,
          dueDate: new Date(orderDate.getTime() + randomCustomer.creditInfo.creditTermDays * 24 * 60 * 60 * 1000),
        },
        status: randomStatus,
        statusHistory: [
          { status: 'pending', timestamp: orderDate, updatedBy: users[2]._id, notes: 'Order created' },
        ],
        fulfillment: {
          warehouseId: null,
        },
        shipping: {
          method: 'standard',
          carrier: 'In-house',
        },
        assignedTo: users[2]._id,
        createdBy: users[2]._id,
        updatedBy: users[2]._id,
        createdAt: orderDate,
        updatedAt: orderDate,
      });

      if (isDelivered) {
        const adjKey1 = `${randomProduct1._id.toString()}:${variant1._id.toString()}`;
        const adjKey2 = `${randomProduct2._id.toString()}:${variant2._id.toString()}`;
        const prevAdj1 = stockAdjustments.get(adjKey1);
        const prevAdj2 = stockAdjustments.get(adjKey2);
        stockAdjustments.set(adjKey1, {
          productId: randomProduct1._id,
          variantId: variant1._id,
          variantSku: variant1.variantSku,
          quantity: (prevAdj1?.quantity || 0) + qty1,
        });
        stockAdjustments.set(adjKey2, {
          productId: randomProduct2._id,
          variantId: variant2._id,
          variantSku: variant2.variantSku,
          quantity: (prevAdj2?.quantity || 0) + qty2,
        });

        const prevQty1 = stockSnapshot.has(adjKey1) ? stockSnapshot.get(adjKey1)! : variant1.stock.quantity;
        const newQty1 = Math.max(0, prevQty1 - qty1);
        stockSnapshot.set(adjKey1, newQty1);

        const prevQty2 = stockSnapshot.has(adjKey2) ? stockSnapshot.get(adjKey2)! : variant2.stock.quantity;
        const newQty2 = Math.max(0, prevQty2 - qty2);
        stockSnapshot.set(adjKey2, newQty2);

        inventoryTransactions.push(
          {
            _id: item1TransactionId,
            productId: randomProduct1._id,
            variantId: variant1._id,
            variantSku: variant1.variantSku,
            transactionType: 'sale',
            quantity: -qty1,
            previousQuantity: prevQty1,
            newQuantity: newQty1,
            referenceType: 'Order',
            referenceId: orderId,
            referenceNumber: `ORD-2024-${String(i + 1).padStart(5, '0')}`,
            performedBy: users[2]._id,
            performedAt: orderDate,
            metadata: {
              orderId,
              orderStatus: 'delivered',
              customerId: randomCustomer._id,
            },
          },
          {
            _id: item2TransactionId,
            productId: randomProduct2._id,
            variantId: variant2._id,
            variantSku: variant2.variantSku,
            transactionType: 'sale',
            quantity: -qty2,
            previousQuantity: prevQty2,
            newQuantity: newQty2,
            referenceType: 'Order',
            referenceId: orderId,
            referenceNumber: `ORD-2024-${String(i + 1).padStart(5, '0')}`,
            performedBy: users[2]._id,
            performedAt: orderDate,
            metadata: {
              orderId,
              orderStatus: 'delivered',
              customerId: randomCustomer._id,
            },
          }
        );
      }
    }

    await Order.insertMany(orders);
    console.log(`Created ${orders.length} orders`);

    if (stockAdjustments.size > 0) {
      const stockUpdates = Array.from(stockAdjustments.values()).map((adj) => ({
        updateOne: {
          filter: { _id: adj.productId, 'variants._id': adj.variantId },
          update: {
            $inc: {
              'variants.$.stock.quantity': -adj.quantity,
              'variants.$.stock.availableQuantity': -adj.quantity,
            },
          },
        },
      }));
      await Product.bulkWrite(stockUpdates);
    }

    if (inventoryTransactions.length > 0) {
      await InventoryTransaction.insertMany(inventoryTransactions);
    }

    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n==============================================');
    console.log('       SEED COMPLETED SUCCESSFULLY!           ');
    console.log('==============================================');
    console.log('\nData Summary:');
    console.log(`  Users:      ${users.length}`);
    console.log(`  Categories: ${allCategories.length}`);
    console.log(`  Products:   ${products.length}`);
    console.log(`  Customers:  ${customers.length}`);
    console.log(`  Orders:     ${orders.length}`);
    console.log('\n----------------------------------------------');
    console.log('Login Credentials:');
    console.log('----------------------------------------------');
    console.log('Super Admin:   sa@oms.com / admin123');
    console.log('Admin:         admin@oms.com / password123');
    console.log('HOD:           hod@oms.com / password123');
    console.log('Accountant:    accountant@oms.com / password123');
    console.log('Supervisor:    supervisor@oms.com / password123');
    console.log('Sales Team:    sales@oms.com / password123');
    console.log('Delivery Team: delivery@oms.com / password123');
    console.log('HRM:           hrm@oms.com / password123');
    console.log('==============================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seed();
