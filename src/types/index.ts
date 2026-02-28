import { Request } from 'express';
import { Document, Types } from 'mongoose';

// User Types
export interface IUser extends Document {
  _id: Types.ObjectId;
  employeeId: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatar?: string;
  phone?: string;
  role: UserRole;
  permissions: string[];
  department?: string;
  warehouseId?: Types.ObjectId;
  territories?: string[];
  status: UserStatus;
  lastLogin?: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  refreshTokens: IRefreshToken[];
  preferences: IUserPreferences;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRefreshToken {
  token: string;
  deviceInfo?: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface IUserPreferences {
  theme?: string;
  language?: string;
  timezone?: string;
  notifications?: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
}

export type UserRole = 'super_admin' | 'admin' | 'hod' | 'accountant' | 'supervisor' | 'sales_team' | 'delivery_team' | 'hrm';
export type UserStatus = 'active' | 'inactive' | 'suspended';

// Product Types
export interface IProduct extends Document {
  _id: Types.ObjectId;
  sku: string;
  name: string;
  nameAr?: string;
  description?: string;
  category: IProductCategory;
  brand?: IProductBrand;
  baseUnit: string;
  images: IProductImage[];
  tags: string[];
  attributes: Record<string, any>;
  variants: IProductVariant[];
  status: ProductStatus;
  seoMeta?: ISeoMeta;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProductCategory {
  _id: Types.ObjectId;
  name: string;
  path: string;
}

export interface IProductBrand {
  _id: Types.ObjectId;
  name: string;
}

export interface IProductImage {
  url: string;
  isPrimary: boolean;
  alt?: string;
}

export interface IProductVariant {
  _id: Types.ObjectId;
  variantSku: string;
  name: string;
  size: number;
  unit: string;
  displaySize: string;
  barcode?: string;
  salesUom?: {
    unitLabel?: string;
    pcsPerUnit?: number;
  };
  price: IVariantPrice;
  stock: IVariantStock;
  status: VariantStatus;
  weight?: number;
  dimensions?: IDimensions;
}

export interface IVariantPrice {
  basePrice: number;
  sellingPrice: number;
  discountedPrice?: number;
  discountPercent?: number;
  taxRate: number;
  taxInclusive: boolean;
}

export interface IVariantStock {
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  reorderLevel: number;
  reorderQuantity: number;
  warehouseLocation?: string;
}

export interface IDimensions {
  length: number;
  width: number;
  height: number;
}

export interface ISeoMeta {
  title?: string;
  description?: string;
  keywords?: string[];
}

export type ProductStatus = 'active' | 'inactive' | 'draft';
export type VariantStatus = 'active' | 'inactive' | 'discontinued';

// Category Types
export interface ICategory extends Document {
  _id: Types.ObjectId;
  name: string;
  nameAr?: string;
  slug: string;
  description?: string;
  parentId?: Types.ObjectId;
  path: string;
  pathIds: Types.ObjectId[];
  level: number;
  image?: string;
  icon?: string;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Customer Types
export interface ICustomer extends Document {
  _id: Types.ObjectId;
  customerCode: string;
  type: CustomerType;
  name: string;
  companyName?: string;
  tradeLicenseNo?: string;
  taxRegistrationNo?: string;
  email?: string;
  phone: string;
  alternatePhone?: string;
  addresses: ICustomerAddress[];
  creditInfo: ICreditInfo;
  financialSummary: IFinancialSummary;
  priceGroup: string;
  discountPercent: number;
  status: CustomerStatus;
  blockReason?: string;
  assignedSalesRep?: Types.ObjectId;
  territory?: string;
  preferences: ICustomerPreferences;
  notes: ICustomerNote[];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICustomerAddress {
  _id: Types.ObjectId;
  type: AddressType;
  label?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  country: string;
  postalCode?: string;
  landmark?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  isDefault: boolean;
  contactPerson?: string;
  contactPhone?: string;
}

export interface ICreditInfo {
  creditLimit: number;
  currentOutstanding: number;
  availableCredit: number;
  creditTermDays: number;
  creditStatus: CreditStatus;
  lastCreditReviewDate?: Date;
  nextCreditReviewDate?: Date;
  creditScore?: number;
  riskCategory?: RiskCategory;
}

export interface IFinancialSummary {
  totalOrders: number;
  totalOrderValue: number;
  totalPaidAmount: number;
  totalOutstanding: number;
  overdueAmount: number;
  lastOrderDate?: Date;
  lastPaymentDate?: Date;
  lastPaymentAmount?: number;
  averageOrderValue?: number;
  averagePaymentDays?: number;
}

export interface ICustomerPreferences {
  preferredPaymentMethod?: string;
  preferredDeliveryTime?: string;
  communicationPreference?: string;
  language?: string;
}

export interface ICustomerNote {
  note: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

export type CustomerType = 'individual' | 'business';
export type AddressType = 'billing' | 'shipping';
export type CustomerStatus = 'active' | 'inactive' | 'blocked';
export type CreditStatus = 'active' | 'suspended' | 'blocked';
export type RiskCategory = 'low' | 'medium' | 'high';

// Order Types
export interface IOrder extends Document {
  _id: Types.ObjectId;
  orderNumber: string;
  customerId: Types.ObjectId;
  customerCode: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  orderType: OrderType;
  orderSource: OrderSource;
  billingAddress: IOrderAddress;
  shippingAddress: IOrderAddress;
  items: IOrderItem[];
  pricing: IOrderPricing;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  balanceDue: number;
  payments: IPayment[];
  creditInfo?: IOrderCreditInfo;
  status: OrderStatus;
  statusHistory: IStatusHistory[];
  approval?: IOrderApproval;
  fulfillment: IFulfillment;
  shipping?: IShipping;
  notes?: string;
  internalNotes?: string;
  tags: string[];
  linkedOrders: ILinkedOrder[];
  assignedTo?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
}

export interface IOrderAddress {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  country: string;
  postalCode?: string;
  contactPerson?: string;
  contactPhone?: string;
  deliveryInstructions?: string;
}

export interface IOrderItem {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  sku: string;
  variantSku: string;
  name: string;
  variantName: string;
  displaySize: string;
  quantity: number;
  sellBy?: 'unit' | 'pcs';
  pcsPerUnit?: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  inventoryDeducted: boolean;
  inventoryTransactionId?: Types.ObjectId;
}

export interface IOrderPricing {
  subtotal: number;
  itemDiscountTotal: number;
  orderDiscount?: {
    type: 'percent' | 'fixed';
    value: number;
    amount: number;
    code?: string;
    reason?: string;
  };
  taxTotal: number;
  shippingCharge: number;
  shippingDiscount: number;
  grandTotal: number;
  roundingAdjustment: number;
}

export interface IPayment {
  _id?: Types.ObjectId;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  paidAt: Date;
  receivedBy?: Types.ObjectId;
}

export interface IOrderCreditInfo {
  isCreditSale: boolean;
  creditDays: number;
  dueDate?: Date;
  invoiceNumber?: string;
  ledgerEntryId?: Types.ObjectId;
}

export interface IStatusHistory {
  status: OrderStatus;
  timestamp: Date;
  updatedBy?: Types.ObjectId;
  notes?: string;
}

export interface IOrderApprovalDecision {
  approverId: Types.ObjectId;
  approverRole: UserRole;
  decision: 'approved' | 'rejected';
  notes?: string;
  decidedAt: Date;
}

export interface IOrderApproval {
  required: boolean;
  status: 'not_required' | 'pending' | 'approved' | 'rejected';
  approverRoles: UserRole[];
  submittedAt?: Date;
  approvedAt?: Date;
  approvedBy?: Types.ObjectId;
  rejectedAt?: Date;
  rejectedBy?: Types.ObjectId;
  decisionNotes?: string;
  decisions: IOrderApprovalDecision[];
}

export interface IFulfillment {
  warehouseId?: Types.ObjectId;
  pickedAt?: Date;
  pickedBy?: Types.ObjectId;
  packedAt?: Date;
  packedBy?: Types.ObjectId;
  shippedAt?: Date;
  shippedBy?: Types.ObjectId;
  deliveredAt?: Date;
  deliveredBy?: Types.ObjectId;
  deliveryProof?: {
    signature?: string;
    photo?: string;
    receiverName?: string;
  };
}

export interface IShipping {
  method?: string;
  carrier?: string;
  trackingNumber?: string;
  estimatedDelivery?: Date;
  actualDelivery?: Date;
  weight?: number;
  packages?: number;
}

export interface ILinkedOrder {
  orderId: Types.ObjectId;
  orderNumber: string;
  type: string;
}

export type OrderType = 'sales' | 'return' | 'exchange';
export type OrderSource = 'web' | 'mobile' | 'pos' | 'phone' | 'whatsapp';
export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'refunded';
export type PaymentMethod = 'cod' | 'credit' | 'prepaid' | 'cash' | 'bank_transfer' | 'cheque' | 'card';
export type OrderStatus =
  | 'draft'
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'picked'
  | 'packed'
  | 'ready_to_ship'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'returned'
  | 'partially_returned';

// Customer Ledger Types
export interface ICustomerLedger extends Document {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  customerCode: string;
  transactionType: LedgerTransactionType;
  transactionDate: Date;
  referenceType: string;
  referenceId?: Types.ObjectId;
  referenceNumber?: string;
  debitAmount: number;
  creditAmount: number;
  balanceAfter: number;
  invoiceDetails?: IInvoiceDetails;
  paymentDetails?: IPaymentDetails;
  description?: string;
  notes?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IInvoiceDetails {
  dueDate?: Date;
  paymentTerms?: string;
  isPaid: boolean;
  paidAmount: number;
  paidDate?: Date;
  isOverdue: boolean;
  daysOverdue: number;
}

export interface IPaymentDetails {
  paymentMethod?: string;
  paymentReference?: string;
  bankName?: string;
  appliedToInvoices?: {
    invoiceId: Types.ObjectId;
    invoiceNumber: string;
    amount: number;
  }[];
}

export type LedgerTransactionType = 'invoice' | 'payment' | 'credit_note' | 'debit_note' | 'adjustment';

// Inventory Transaction Types
export interface IInventoryTransaction extends Document {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  variantSku: string;
  transactionType: InventoryTransactionType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  referenceType: string;
  referenceId?: Types.ObjectId;
  referenceNumber?: string;
  warehouseId?: Types.ObjectId;
  notes?: string;
  performedBy?: Types.ObjectId;
  performedAt: Date;
  metadata?: Record<string, any>;
}

export type InventoryTransactionType =
  | 'purchase'
  | 'sale'
  | 'adjustment'
  | 'return'
  | 'transfer'
  | 'damage';

// JWT Payload
export interface IJWTPayload {
  sub: string;
  email: string;
  role: UserRole;
  permissions: string[];
  warehouseId?: string;
}

// Request with User
export interface IAuthRequest extends Request {
  user?: IUser;
  permissions?: string[];
}

// Alias for AuthenticatedRequest (used in some controllers)
export type AuthenticatedRequest = IAuthRequest;

// API Response
export interface IAPIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
  details?: any;
}

// Pagination
export interface IPaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface IPaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Attendance Types
export interface IAttendance extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  employeeId: string;
  date: Date;
  clockIn: IClockRecord;
  clockOut?: IClockRecord;
  workHours: {
    regular: number;
    overtime: number;
    total: number;
  };
  status: AttendanceStatus;
  isLate: boolean;
  lateMinutes: number;
  isEarlyLeave: boolean;
  earlyLeaveMinutes: number;
  breakDuration: number;
  notes?: string;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  // Payroll-specific overtime breakdown
  payrollOvertime?: {
    ot1Hours: number;
    ot1Rate: number;
    ot2Hours: number;
    ot2Rate: number;
    totalOvertimeAmount: number;
  };
  // Payroll processing status
  payrollStatus: 'pending' | 'processed' | 'locked';
  payrollRunId?: Types.ObjectId;
  payrollProcessedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IClockRecord {
  time: Date;
  location?: ILocation;
  deviceInfo?: string;
  notes?: string;
}

export interface ILocation {
  type: 'Point';
  coordinates: [number, number];
  address?: string;
}

export type AttendanceStatus = 'present' | 'half_day' | 'absent' | 'leave' | 'holiday' | 'weekend';

// Leave Types
export interface ILeave extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  employeeId: string;
  leaveType: LeaveType;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  halfDay: boolean;
  reason: string;
  contactNumber?: string;
  emergencyContact?: {
    name: string;
    phone: string;
  };
  attachments?: {
    url: string;
    filename: string;
    uploadedAt: Date;
  }[];
  status: LeaveStatus;
  currentApprovalLevel: number;
  approvalWorkflow: ILeaveApproval[];
  finalApproverId?: Types.ObjectId;
  finalApprovalDate?: Date;
  rejectionReason?: string;
  cancelledBy?: Types.ObjectId;
  cancelledAt?: Date;
  cancellationReason?: string;
  // Payroll fields
  isPaidLeave?: boolean;
  payrollStatus?: 'pending' | 'processed' | 'locked';
  payrollRunId?: Types.ObjectId;
  payrollProcessedAt?: Date;
  payrollImpact?: {
    deductionAmount: number;
    deductionDays: number;
  };
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILeaveApproval {
  level: number;
  approverId: Types.ObjectId;
  approverName: string;
  status: 'pending' | 'approved' | 'rejected';
  comments?: string;
  timestamp?: Date;
}

export type LeaveType = 'annual' | 'sick' | 'casual' | 'unpaid' | 'maternity' | 'paternity' | 'emergency' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

// Leave Balance Types
export interface ILeaveBalance extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  employeeId: string;
  year: number;
  annual: ILeaveBalanceByType;
  sick: ILeaveBalanceByType;
  casual: ILeaveBalanceByType;
  unpaid: ILeaveBalanceByType;
  maternity?: ILeaveBalanceByType;
  paternity?: ILeaveBalanceByType;
  emergency?: ILeaveBalanceByType;
  other?: ILeaveBalanceByType;
  lastUpdated: Date;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  // Instance methods
  updateBalance(leaveType: string, days: number, operation: 'deduct' | 'add'): void;
  updatePendingCount(leaveType: string, days: number, operation: 'add' | 'remove'): void;
}

export interface ILeaveBalanceByType {
  allocated: number;
  used: number;
  pending: number;
  available: number;
  carriedForward: number;
}

// Shop Visit Types
export interface IShopVisit extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  employeeId: string;
  customerId: Types.ObjectId;
  customerCode: string;
  customerName: string;
  visitDate: Date;
  checkIn: {
    time: Date;
    location: ILocation;
    deviceInfo?: string;
  };
  checkOut?: {
    time: Date;
    location: ILocation;
    deviceInfo?: string;
  };
  duration: number;
  visitType: VisitType;
  purpose: string;
  activities: IVisitActivity[];
  notes?: string;
  feedback?: {
    customerSatisfaction?: number;
    comments?: string;
  };
  nextVisitDate?: Date;
  photos?: {
    url: string;
    caption?: string;
    uploadedAt: Date;
  }[];
  status: VisitStatus;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  // Instance methods
  calculateDuration(): void;
}

export interface IVisitActivity {
  type: VisitActivityType;
  description: string;
  referenceId?: Types.ObjectId;
  referenceType?: string;
  amount?: number;
  timestamp: Date;
}

export type VisitType = 'scheduled' | 'unscheduled' | 'follow_up' | 'emergency';
export type VisitStatus = 'in_progress' | 'completed' | 'cancelled';
export type VisitActivityType = 'order_placed' | 'payment_collected' | 'product_demo' | 'feedback_collected' | 'issue_resolved' | 'stock_checked' | 'other';

// Approval Config Types
export interface IApprovalConfig extends Document {
  _id: Types.ObjectId;
  name: string;
  type: ApprovalType;
  description?: string;
  isActive: boolean;
  applicableFor: {
    roles?: string[];
    departments?: string[];
    employeeIds?: Types.ObjectId[];
  };
  conditions?: IApprovalCondition[];
  levels: IApprovalLevel[];
  notificationSettings: {
    notifyOnSubmit: boolean;
    notifyOnApproval: boolean;
    notifyOnRejection: boolean;
    reminderIntervalHours: number;
  };
  metadata?: Record<string, any>;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IApprovalLevel {
  level: number;
  name: string;
  approverRole?: string;
  approverIds?: Types.ObjectId[];
  approverEmails?: string[];
  isAutoApproved: boolean;
  autoApprovalConditions?: IApprovalCondition[];
  timeoutHours?: number;
  isParallel: boolean;
  minimumApprovals: number;
}

export interface IApprovalCondition {
  field: string;
  operator: 'equals' | 'greater_than' | 'less_than' | 'contains' | 'in_range';
  value: any;
}

export type ApprovalType = 'leave' | 'overtime' | 'expense' | 'purchase' | 'advance' | 'payroll' | 'custom';

// ==================== PAYROLL MODULE TYPES ====================

// Lookup Value Types
export interface ILookupValue extends Document {
  _id: Types.ObjectId;
  category: string;
  code: string;
  name: string;
  nameAr?: string;
  description?: string;
  parentId?: Types.ObjectId;
  parentCode?: string;
  metadata?: {
    color?: string;
    icon?: string;
    sortOrder?: number;
    additionalData?: Record<string, any>;
  };
  isActive: boolean;
  isSystem: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Earning & Deduction Types
export interface IEarningDeduction extends Document {
  _id: Types.ObjectId;
  code: string;
  name: string;
  nameAr?: string;
  type: 'earning' | 'deduction';
  category: 'fixed' | 'variable' | 'statutory' | 'reimbursement';
  calculation: {
    method: 'fixed' | 'percentage' | 'formula' | 'slab';
    fixedAmount?: number;
    percentageOf?: string[];
    percentageValue?: number;
    formula?: string;
    slabs?: {
      from: number;
      to: number;
      rate: number;
      fixedAmount?: number;
    }[];
  };
  constraints?: {
    minValue?: number;
    maxValue?: number;
    maxPercentageOfGross?: number;
  };
  // Note: Components must be explicitly assigned to employees via employee.assignedComponents
  // No "apply to all" behavior - each component mapping is individual
  payrollBehavior: {
    affectsGrossSalary: boolean;
    affectsTaxableIncome: boolean;
    affectsNetSalary: boolean;
    prorationApplicable: boolean;
    showInPayslip: boolean;
    payslipDisplayOrder: number;
  };
  statutory?: {
    isStatutory: boolean;
    regulatoryBody?: string;
    complianceCode?: string;
  };
  isActive: boolean;
  isSystem?: boolean;
  effectiveFrom: Date;
  effectiveTo?: Date;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Pay Cycle Types
export interface IPayCycle extends Document {
  _id: Types.ObjectId;
  name: string;
  code: string;
  description?: string;
  // Pay Month in MMYYYY format (e.g., "012026" for January 2026)
  payMonth?: string;
  // Period dates for payroll processing
  periodStartDate?: Date;
  periodEndDate?: Date;
  // Period status for controlling attendance entry
  periodStatus?: 'open' | 'processing' | 'closed';
  // Calculation method for payroll
  calculationMethod?: 'daily_rate' | 'fixed_monthly' | 'hourly_rate';
  // Configurable weekend days (0=Sunday, 1=Monday, ..., 6=Saturday)
  weekendDays?: number[];
  // Standard hours per day for OT calculation
  standardHoursPerDay?: number;
  cycleType: 'monthly' | 'bi_weekly' | 'weekly' | 'hourly';
  monthlyConfig?: {
    payDay: number;
    cutoffDay: number;
    periodStartDay: number;
    workingDaysPerMonth?: number;
  };
  weeklyConfig?: {
    payDayOfWeek: number;
    cycleStartDayOfWeek: number;
  };
  overtimeRates: {
    ot1: {
      enabled?: boolean;
      multiplier: number;
      description: string;
      maxHoursPerDay?: number;
      maxHoursPerMonth?: number;
    };
    ot2: {
      enabled?: boolean;
      multiplier: number;
      description: string;
      maxHoursPerDay?: number;
      maxHoursPerMonth?: number;
    };
  };
  prorationRules: {
    enabled: boolean;
    method: 'calendar_days' | 'working_days' | 'fixed_days';
    fixedDaysPerMonth?: number;
    includeJoiningMonth: boolean;
    includeLeavingMonth: boolean;
    midMonthRules: {
      newJoineeCutoff: number;
      leaverCutoff: number;
    };
  };
  leaveDeductionRules: {
    deductUnpaidLeave: boolean;
    deductLateArrival: boolean;
    lateDeductionThreshold: number;
    lateDeductionUnit: 'fixed_amount' | 'hourly_rate' | 'half_day' | 'full_day';
    lateDeductionValue?: number;
  };
  processingSettings: {
    autoProcessEnabled: boolean;
    autoProcessDay: number;
    requireApproval: boolean;
    approvalLevels: number;
    bankFileFormat: 'csv' | 'xlsx' | 'txt' | 'wps';
  };
  isActive: boolean;
  isDefault: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Employee Types
export interface IEmployee extends Document {
  _id: Types.ObjectId;
  employeeCode: string;
  userId?: Types.ObjectId;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other';
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed';
  nationality?: string;
  bloodGroup?: string;
  email: string;
  phone: string;
  alternatePhone?: string;
  address?: {
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  };
  emergencyContact?: {
    name?: string;
    relationship?: string;
    phone?: string;
  };
  homeCountryContact?: {
    relativeName?: string;
    phone?: string;
  };
  identifications?: {
    type: string;
    number: string;
    issueDate?: Date;
    expiryDate?: Date;
    issuingAuthority?: string;
    attachmentUrl?: string;
  }[];
  qualification?: {
    degree?: string;
    certifiedBy?: string;
    attestedBy?: string;
  };
  employment: {
    department: string;
    division?: string;
    designation: string;
    employmentType: 'full_time' | 'part_time' | 'contract' | 'probation';
    joiningDate: Date;
    confirmationDate?: Date;
    probationEndDate?: Date;
    contractEndDate?: Date;
    serviceEndDate?: Date;
    reportingTo?: Types.ObjectId;
    workLocation?: string;
    shiftType?: string;
  };
  salaryInfo: {
    payCycleId?: Types.ObjectId;
    basicSalary: number;
    allowance?: number;
    currency: string;
    paymentMode: 'bank_transfer' | 'cash' | 'cheque';
    effectiveFrom?: Date;
    salaryHistory?: {
      basicSalary: number;
      allowance?: number;
      effectiveFrom: Date;
      effectiveTo?: Date;
      reason: 'joining' | 'increment' | 'promotion' | 'correction' | 'other';
      incrementAmount?: number;
      incrementReferenceNo?: string;
      approvedBy?: Types.ObjectId;
      approvedAt?: Date;
    }[];
    lastIncrementDate?: Date;
    lastPromotionDate?: Date;
  };
  bankDetails?: {
    bankName?: string;
    branchName?: string;
    accountNumber?: string;
    accountHolderName?: string;
    iban?: string;
    swiftCode?: string;
    routingNumber?: string;
    cardNumber?: string;
    cardExpiryDate?: Date;
  };
  taxInfo?: {
    taxIdentificationNumber?: string;
    taxRegime?: string;
    exemptions?: {
      type: string;
      amount: number;
      documentUrl?: string;
    }[];
  };
  loanInfo?: {
    loanAmount?: number;
    installmentAmount?: number;
    installmentDueDate?: Date;
    maturityDate?: Date;
  };
  assignedComponents?: {
    earnings: {
      componentId?: Types.ObjectId;
      componentCode?: string;
      componentName?: string;
      overrideValue?: number;
      effectiveFrom?: Date;
      effectiveTo?: Date;
      isActive: boolean;
      isAttendanceBased?: boolean;
    }[];
    deductions: {
      componentId?: Types.ObjectId;
      componentCode?: string;
      componentName?: string;
      overrideValue?: number;
      effectiveFrom?: Date;
      effectiveTo?: Date;
      isActive: boolean;
      isAttendanceBased?: boolean;
    }[];
  };
  status: 'active' | 'inactive' | 'terminated' | 'on_hold';
  terminationInfo?: {
    terminationDate?: Date;
    reason?: string;
    type?: 'resignation' | 'termination' | 'retirement' | 'contract_end' | 'other';
    lastWorkingDay?: Date;
    exitInterviewDone?: boolean;
    fullAndFinalStatus?: 'pending' | 'processed' | 'completed';
  };
  documents?: {
    type: string;
    name: string;
    url: string;
    uploadedAt: Date;
    uploadedBy?: Types.ObjectId;
  }[];
  notes?: {
    note: string;
    createdBy?: Types.ObjectId;
    createdAt: Date;
  }[];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type EmployeeStatus = 'active' | 'inactive' | 'terminated' | 'on_hold';

// Advance Types
export interface IAdvance extends Document {
  _id: Types.ObjectId;
  advanceNumber: string;
  employeeId: Types.ObjectId;
  employeeCode: string;
  employeeName: string;
  advanceType: 'salary_advance' | 'loan' | 'emergency';
  requestDate: Date;
  amount: number;
  currency: string;
  reason: string;
  repayment: {
    method: 'full' | 'emi';
    numberOfInstallments: number;
    installmentAmount: number;
    startFromPayCycle?: Date;
    endByPayCycle?: Date;
    schedule: {
      installmentNumber: number;
      dueDate: Date;
      amount: number;
      status: 'pending' | 'deducted' | 'skipped';
      payrollRunId?: Types.ObjectId;
      deductedAt?: Date;
      notes?: string;
    }[];
  };
  balances: {
    totalAmount: number;
    paidAmount: number;
    pendingAmount: number;
    writeOffAmount: number;
  };
  status: 'pending' | 'approved' | 'rejected' | 'disbursed' | 'repaying' | 'completed' | 'cancelled';
  approvalWorkflow: {
    level: number;
    approverId?: Types.ObjectId;
    approverName?: string;
    status: 'pending' | 'approved' | 'rejected';
    comments?: string;
    timestamp?: Date;
  }[];
  // Approval tracking
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  rejectedBy?: Types.ObjectId;
  rejectedAt?: Date;
  rejectionReason?: string;
  // Completion tracking
  completedAt?: Date;
  // Cancellation tracking
  cancellationReason?: string;
  disbursement?: {
    date: Date;
    method: 'bank_transfer' | 'cash' | 'cheque';
    reference?: string;
    processedBy?: Types.ObjectId;
    disbursedAt?: Date;
    disbursedBy?: Types.ObjectId;
  };
  attachments?: {
    name: string;
    url: string;
    uploadedAt: Date;
  }[];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type AdvanceStatus = 'pending' | 'approved' | 'rejected' | 'disbursed' | 'repaying' | 'completed' | 'cancelled';

// Payroll Run Types
export interface IPayrollRun extends Document {
  _id: Types.ObjectId;
  runNumber: string;
  payCycleId: Types.ObjectId;
  payCycleName: string;
  payMonth?: string;  // MMYYYY format from PayCycle
  periodStartDate: Date;
  periodEndDate: Date;
  periodDays?: number;  // Number of days in period
  paymentDate?: Date;
  status: PayrollRunStatus;
  summary: {
    totalEmployees: number;
    processedEmployees: number;
    errorEmployees: number;
    totalGrossEarnings: number;
    totalDeductions: number;
    totalNetPay: number;
    totalTax: number;
    totalOvertimePay: number;
    totalAdvanceDeductions: number;
    totalAdhocEarnings?: number;
    totalAdhocDeductions?: number;
    currency: string;
  };
  employeePayrolls: IEmployeePayroll[];
  approvalWorkflow: {
    level: number;
    approverId?: Types.ObjectId;
    approverName?: string;
    status: 'pending' | 'approved' | 'rejected';
    comments?: string;
    timestamp?: Date;
  }[];
  processingLog: {
    action: string;
    timestamp: Date;
    performedBy?: Types.ObjectId;
    details?: string;
  }[];
  // Calculation tracking
  calculatedAt?: Date;
  calculatedBy?: Types.ObjectId;
  // Approval tracking
  approvedAt?: Date;
  approvedBy?: Types.ObjectId;
  // Cancellation tracking
  cancellation?: {
    reason: string;
    cancelledAt: Date;
    cancelledBy: Types.ObjectId;
  };
  finalization?: {
    finalizedAt?: Date;
    finalizedBy?: Types.ObjectId;
    archiveId?: Types.ObjectId;
    bankFileGenerated: boolean;
    bankFileName?: string;
    bankFileUrl?: string;
  };
  // Rerun history for tracking recalculations
  rerunHistory?: {
    rerunAt: Date;
    rerunBy: Types.ObjectId;
    previousSummary: {
      totalEmployees: number;
      totalGrossEarnings: number;
      totalDeductions: number;
      totalNetPay: number;
      totalOvertimePay: number;
      totalAdvanceDeductions: number;
    };
    changes: {
      employeeCountChange: number;
      grossEarningsChange: number;
      deductionsChange: number;
      netPayChange: number;
    };
  }[];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEmployeePayroll {
  employeeId: Types.ObjectId;
  employeeCode: string;
  employeeName: string;
  department?: string;
  designation?: string;
  attendance: {
    totalWorkingDays: number;
    daysWorked: number;
    daysAbsent: number;
    leaveDays?: number;
    paidLeaveDays: number;
    unpaidLeaveDays: number;
    holidays: number;
    paidHolidays?: number;
    unpaidHolidays?: number;
    weekends: number;
    expectedWorkingDays?: number;
    ot1Hours: number;
    ot1Rate: number;
    ot1Amount: number;
    ot2Hours: number;
    ot2Rate: number;
    ot2Amount: number;
    totalOvertimeAmount: number;
    lateArrivals: number;
    earlyDepartures?: number;
    lateDeductionAmount: number;
    // Holiday details for payslip
    holidayDetails?: {
      name: string;
      date: Date;
      isPaid: boolean;
      isHalfDay: boolean;
    }[];
  };
  earnings: {
    componentId?: Types.ObjectId;
    componentCode: string;
    componentName: string;
    amount: number;
    isProrated: boolean;
    proratedDays?: number;
    fullAmount?: number;
  }[];
  totalEarnings: number;
  deductions: {
    componentId?: Types.ObjectId;
    componentCode: string;
    componentName: string;
    amount: number;
  }[];
  totalDeductions: number;
  advanceDeductions: {
    advanceId?: Types.ObjectId;
    advanceNumber: string;
    installmentNumber: number;
    amount: number;
  }[];
  totalAdvanceDeductions: number;
  // Adhoc items
  adhocItems?: {
    type: 'earning' | 'deduction';
    category: string;
    name: string;
    amount: number;
    referenceNumber?: string;
  }[];
  basicSalary?: number;
  grossSalary: number;
  netSalary: number;
  currency?: string;
  bankDetails?: {
    bankName?: string;
    accountNumber?: string;
    accountHolderName?: string;
    iban?: string;
  };
  status: 'pending' | 'calculated' | 'error' | 'finalized';
  errorMessage?: string;
  proration?: {
    isProrated: boolean;
    reason?: 'new_joinee' | 'termination' | 'mid_month_change';
    effectiveDays?: number;
    totalDays?: number;
    prorationFactor?: number;
  };
}

export type PayrollRunStatus = 'draft' | 'processing' | 'calculated' | 'pending_approval' | 'approved' | 'finalized' | 'paid' | 'cancelled';

// Payroll Archive Types
export interface IPayrollArchive extends Document {
  _id: Types.ObjectId;
  archiveNumber: string;
  payrollRunId: Types.ObjectId;
  runNumber: string;
  payCycleId: Types.ObjectId;
  payCycleName: string;
  periodStartDate: Date;
  periodEndDate: Date;
  paymentDate: Date;
  summary: {
    totalEmployees: number;
    totalGrossEarnings: number;
    totalDeductions: number;
    totalNetPay: number;
    currency: string;
  };
  employeeSnapshots: {
    employeeId: Types.ObjectId;
    employeeCode: string;
    employeeName: string;
    employeeEmail?: string;
    employeePhone?: string;
    department?: string;
    designation?: string;
    basicSalary: number;
    totalDeductions?: number;
    totalAdvanceDeductions?: number;
    attendance?: Record<string, any>;
    earnings: {
      componentCode: string;
      componentName: string;
      amount: number;
    }[];
    deductions: {
      componentCode: string;
      componentName: string;
      amount: number;
    }[];
    advanceDeductions: {
      advanceNumber: string;
      amount: number;
    }[];
    grossSalary: number;
    netSalary: number;
    bankDetails?: {
      bankName?: string;
      accountNumber?: string;
      accountHolderName?: string;
      iban?: string;
    };
    proration?: {
      isProrated: boolean;
      reason?: string;
      prorationFactor?: number;
    };
    payslipUrl?: string;
    payslipGeneratedAt?: Date;
  }[];
  files?: {
    summaryReportUrl?: string;
    bankFileUrl?: string;
    payslipsZipUrl?: string;
  };
  status: 'archived' | 'locked';
  archivedAt: Date;
  archivedBy?: Types.ObjectId;
  lockedAt?: Date;
  lockedBy?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Attendance Settings Types
export interface IAttendanceSettings extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  workingHours: IWorkingHours[];
  lateArrivalThresholdMinutes: number;
  earlyLeaveThresholdMinutes: number;
  halfDayThresholdHours: number;
  overtimeEnabled: boolean;
  overtimeThresholdHours: number;
  requireClockInLocation: boolean;
  allowedClockInRadius: number;
  autoClockOutEnabled: boolean;
  autoClockOutTime: string;
  holidays: IHoliday[];
  leaveTypes: any[];
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWorkingHours {
  dayOfWeek: number;
  isWorkingDay: boolean;
  startTime: string;
  endTime: string;
  breakDuration: number;
}

export interface IHoliday {
  _id: Types.ObjectId;
  name: string;
  date: Date;
  type: 'national' | 'religious' | 'company' | 'optional';
  isRecurring: boolean;
  description?: string;
}

// Adhoc Earning/Deduction Types
export interface IAdhocEarningDeduction extends Document {
  _id: Types.ObjectId;
  referenceNumber: string;
  employeeId: Types.ObjectId;
  employeeCode: string;
  employeeName: string;
  type: 'earning' | 'deduction';
  category: AdhocCategory;
  name: string;
  description?: string;
  amount: number;
  currency: string;
  payrollPeriod: {
    month: number;
    year: number;
  };
  payrollRunId?: Types.ObjectId;
  processedAt?: Date;
  status: AdhocStatus;
  approval: {
    requiredLevel: number;
    currentLevel: number;
    history: {
      level: number;
      approverId?: Types.ObjectId;
      approverName?: string;
      action: 'approved' | 'rejected';
      comments?: string;
      timestamp: Date;
    }[];
  };
  payrollBehavior: {
    affectsGrossSalary: boolean;
    affectsTaxableIncome: boolean;
    showInPayslip: boolean;
    payslipLabel?: string;
  };
  attachments?: {
    fileName: string;
    fileUrl: string;
    fileType?: string;
    uploadedAt: Date;
  }[];
  notes?: string;
  internalNotes?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type AdhocCategory =
  | 'bonus'
  | 'incentive'
  | 'commission'
  | 'overtime_adjustment'
  | 'arrears'
  | 'reimbursement'
  | 'allowance_adjustment'
  | 'fine'
  | 'penalty'
  | 'loan_recovery'
  | 'damage_deduction'
  | 'advance_adjustment'
  | 'tax_adjustment'
  | 'other';

export type AdhocStatus = 'pending' | 'approved' | 'rejected' | 'processed' | 'cancelled';

// Holiday Types
export interface IHolidayMaster extends Document {
  _id: Types.ObjectId;
  name: string;
  date: Date;
  year: number;
  type: HolidayType;
  isHalfDay: boolean;
  applicableTo: HolidayApplicableTo;
  departments?: string[];
  locations?: string[];
  isPaid: boolean;
  description?: string;
  isActive: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type HolidayType = 'public' | 'religious' | 'company' | 'optional';
export type HolidayApplicableTo = 'all' | 'department' | 'location';
