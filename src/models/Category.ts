import mongoose, { Schema } from 'mongoose';
import { ICategory } from '../types';

const categorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    nameAr: {
      type: String,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: String,
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true,
    },
    path: {
      type: String,
      required: true,
      index: true,
    },
    pathIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Category',
    }],
    level: {
      type: Number,
      required: true,
      default: 0,
      index: true,
    },
    image: String,
    icon: String,
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    productCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
categorySchema.index({ slug: 1 });
categorySchema.index({ parentId: 1, isActive: 1 });
categorySchema.index({ path: 1 });
categorySchema.index({ level: 1 });

const Category = mongoose.model<ICategory>('Category', categorySchema);

export default Category;
