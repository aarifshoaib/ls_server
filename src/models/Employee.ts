import mongoose, { Schema } from 'mongoose';
import { IEmployee } from '../types';

const employeeSchema = new Schema<IEmployee>(
  {
    employeeCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      sparse: true,
      index: true,
    },
    // Personal Information
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    fullName: {
      type: String,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
    },
    maritalStatus: {
      type: String,
      enum: ['single', 'married', 'divorced', 'widowed'],
    },
    nationality: {
      type: String,
      trim: true,
    },
    bloodGroup: {
      type: String,
      trim: true,
    },
    // Contact Information
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    alternatePhone: {
      type: String,
      trim: true,
    },
    address: {
      addressLine1: String,
      addressLine2: String,
      city: String,
      state: String,
      country: String,
      postalCode: String,
    },
    emergencyContact: {
      name: String,
      relationship: String,
      phone: String,
    },
    // Home Country Contact
    homeCountryContact: {
      relativeName: String,
      phone: String,
    },
    // Identification Documents
    identifications: [{
      type: {
        type: String,
        enum: ['passport', 'emirates_id', 'visa', 'work_permit', 'driving_license', 'national_id', 'other'],
      },
      number: String,
      issueDate: Date,
      expiryDate: Date,
      issuingAuthority: String,
      attachmentUrl: String,
    }],
    // Qualification
    qualification: {
      degree: String,
      certifiedBy: String,
      attestedBy: String,
    },
    // Employment Information
    employment: {
      department: {
        type: String,
        required: true,
        index: true,
      },
      division: String,
      designation: {
        type: String,
        required: true,
        index: true,
      },
      employmentType: {
        type: String,
        enum: ['full_time', 'part_time', 'contract', 'probation'],
        default: 'full_time',
      },
      joiningDate: {
        type: Date,
        required: true,
      },
      confirmationDate: Date,
      probationEndDate: Date,
      contractEndDate: Date,
      serviceEndDate: Date,
      reportingTo: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
      },
      workLocation: String,
      shiftType: String,
    },
    // Salary Information
    salaryInfo: {
      payCycleId: {
        type: Schema.Types.ObjectId,
        ref: 'PayCycle',
        index: true,
      },
      basicSalary: {
        type: Number,
        required: true,
        default: 0,
      },
      allowance: {
        type: Number,
        default: 0,
      },
      currency: {
        type: String,
        default: 'AED',
      },
      paymentMode: {
        type: String,
        enum: ['bank_transfer', 'cash', 'cheque'],
        default: 'bank_transfer',
      },
      effectiveFrom: Date,
      salaryHistory: [{
        basicSalary: Number,
        allowance: Number,
        effectiveFrom: Date,
        effectiveTo: Date,
        reason: {
          type: String,
          enum: ['joining', 'increment', 'promotion', 'correction', 'other'],
        },
        incrementAmount: Number,
        incrementReferenceNo: String,
        approvedBy: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
        approvedAt: Date,
      }],
      lastIncrementDate: Date,
      lastPromotionDate: Date,
    },
    // Bank Details
    bankDetails: {
      bankName: String,
      branchName: String,
      accountNumber: String,
      accountHolderName: String,
      iban: String,
      swiftCode: String,
      routingNumber: String,
      cardNumber: String,
      cardExpiryDate: Date,
    },
    // Tax & Statutory Information
    taxInfo: {
      taxIdentificationNumber: String,
      taxRegime: String,
      exemptions: [{
        type: String,
        amount: Number,
        documentUrl: String,
      }],
    },
    // Loan/Advance Information
    loanInfo: {
      loanAmount: {
        type: Number,
        default: 0,
      },
      installmentAmount: {
        type: Number,
        default: 0,
      },
      installmentDueDate: Date,
      maturityDate: Date,
    },
    // Assigned Earnings & Deductions
    // componentId now references LookupValue (categories: EARNING_COMPONENT, DEDUCTION_COMPONENT)
    assignedComponents: {
      earnings: [{
        componentId: {
          type: Schema.Types.ObjectId,
          ref: 'LookupValue',
        },
        componentCode: {
          type: String,
          trim: true,
        },
        componentName: {
          type: String,
          trim: true,
        },
        overrideValue: Number,
        effectiveFrom: Date,
        effectiveTo: Date,
        isActive: {
          type: Boolean,
          default: true,
        },
        // Pro-rated flag: if true, amount is calculated based on attendance days
        isAttendanceBased: {
          type: Boolean,
          default: false,
        },
      }],
      deductions: [{
        componentId: {
          type: Schema.Types.ObjectId,
          ref: 'LookupValue',
        },
        componentCode: {
          type: String,
          trim: true,
        },
        componentName: {
          type: String,
          trim: true,
        },
        overrideValue: Number,
        effectiveFrom: Date,
        effectiveTo: Date,
        isActive: {
          type: Boolean,
          default: true,
        },
        // Pro-rated flag: if true, amount is calculated based on attendance days
        isAttendanceBased: {
          type: Boolean,
          default: false,
        },
      }],
    },
    // Status
    status: {
      type: String,
      enum: ['active', 'inactive', 'terminated', 'on_hold'],
      default: 'active',
      index: true,
    },
    terminationInfo: {
      terminationDate: Date,
      reason: String,
      type: {
        type: String,
        enum: ['resignation', 'termination', 'retirement', 'contract_end', 'other'],
      },
      lastWorkingDay: Date,
      exitInterviewDone: {
        type: Boolean,
        default: false,
      },
      fullAndFinalStatus: {
        type: String,
        enum: ['pending', 'processed', 'completed'],
        default: 'pending',
      },
    },
    // Documents
    documents: [{
      type: {
        type: String,
        enum: ['offer_letter', 'contract', 'certificate', 'id_proof', 'photo', 'resume', 'other'],
      },
      name: String,
      url: String,
      uploadedAt: Date,
      uploadedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    }],
    // Notes
    notes: [{
      note: String,
      createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    }],
    // Audit
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to set fullName
employeeSchema.pre('save', function(next) {
  if (this.firstName && this.lastName) {
    this.fullName = `${this.firstName} ${this.lastName}`;
  }
  next();
});

// Indexes
employeeSchema.index({ 'employment.department': 1, status: 1 });
employeeSchema.index({ 'employment.designation': 1, status: 1 });
employeeSchema.index({ 'salaryInfo.payCycleId': 1, status: 1 });
employeeSchema.index({ firstName: 'text', lastName: 'text', email: 'text' });
employeeSchema.index({ createdAt: -1 });

// Virtual for service duration
employeeSchema.virtual('serviceDuration').get(function() {
  if (!this.employment?.joiningDate) return null;
  const endDate = this.terminationInfo?.lastWorkingDay || new Date();
  const diff = endDate.getTime() - new Date(this.employment.joiningDate).getTime();
  const years = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  const months = Math.floor((diff % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));
  return { years, months };
});

// Virtual for age
employeeSchema.virtual('age').get(function() {
  if (!this.dateOfBirth) return null;
  const diff = Date.now() - new Date(this.dateOfBirth).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
});

employeeSchema.set('toJSON', { virtuals: true });
employeeSchema.set('toObject', { virtuals: true });

const Employee = mongoose.model<IEmployee>('Employee', employeeSchema);

export default Employee;
