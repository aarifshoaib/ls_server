import mongoose, { Schema } from 'mongoose';
import { IShopVisit, IVisitActivity } from '../types';

const visitActivitySchema = new Schema<IVisitActivity>(
  {
    type: {
      type: String,
      enum: ['order_placed', 'payment_collected', 'product_demo', 'feedback_collected', 'issue_resolved', 'stock_checked', 'other'],
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    referenceId: Schema.Types.ObjectId,
    referenceType: String,
    amount: Number,
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const shopVisitSchema = new Schema<IShopVisit>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    employeeId: {
      type: String,
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    customerCode: {
      type: String,
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      required: true,
    },
    visitDate: {
      type: Date,
      required: true,
      index: true,
    },
    checkIn: {
      time: {
        type: Date,
        required: true,
      },
      location: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point',
        },
        coordinates: {
          type: [Number],
          required: true,
        },
        address: String,
      },
      deviceInfo: String,
    },
    checkOut: {
      time: Date,
      location: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point',
        },
        coordinates: [Number],
        address: String,
      },
      deviceInfo: String,
    },
    duration: {
      type: Number,
      default: 0,
    },
    visitType: {
      type: String,
      enum: ['scheduled', 'unscheduled', 'follow_up', 'emergency'],
      default: 'scheduled',
      index: true,
    },
    purpose: {
      type: String,
      required: true,
    },
    activities: [visitActivitySchema],
    notes: String,
    feedback: {
      customerSatisfaction: {
        type: Number,
        min: 1,
        max: 5,
      },
      comments: String,
    },
    nextVisitDate: Date,
    photos: [
      {
        url: String,
        caption: String,
        uploadedAt: Date,
      },
    ],
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'cancelled'],
      default: 'in_progress',
      index: true,
    },
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

// Indexes
shopVisitSchema.index({ userId: 1, visitDate: -1 });
shopVisitSchema.index({ customerId: 1, visitDate: -1 });
shopVisitSchema.index({ employeeId: 1, status: 1 });
shopVisitSchema.index({ visitType: 1, status: 1 });
shopVisitSchema.index({ 'checkIn.time': -1 });
shopVisitSchema.index({ createdAt: -1 });

// Geospatial index for location queries
shopVisitSchema.index({ 'checkIn.location': '2dsphere' });
shopVisitSchema.index({ 'checkOut.location': '2dsphere' });

// Method to calculate duration
shopVisitSchema.methods.calculateDuration = function () {
  if (this.checkIn.time && this.checkOut?.time) {
    this.duration = Math.floor(
      (this.checkOut.time.getTime() - this.checkIn.time.getTime()) / 60000
    );
  }
};

const ShopVisit = mongoose.model<IShopVisit>('ShopVisit', shopVisitSchema);

export default ShopVisit;
