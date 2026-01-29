import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { ProductService } from '../services/product.service';

export class ProductController {
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await ProductService.getProducts(req.query, req.query);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const product = await ProductService.getProductById(req.params.id);

      res.json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getBySku(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const product = await ProductService.getProductBySku(req.params.sku);

      res.json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const product = await ProductService.createProduct(req.body, userId);

      res.status(201).json({
        success: true,
        data: product,
        message: 'Product created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const product = await ProductService.updateProduct(req.params.id, req.body, userId);

      res.json({
        success: true,
        data: product,
        message: 'Product updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await ProductService.deleteProduct(req.params.id);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getLowStock(_req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const products = await ProductService.getLowStockProducts();

      res.json({
        success: true,
        data: products,
      });
    } catch (error) {
      next(error);
    }
  }
}
