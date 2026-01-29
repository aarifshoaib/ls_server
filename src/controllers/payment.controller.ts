import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { PaymentService } from '../services/payment.service';

export class PaymentController {
  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const payment = await PaymentService.recordPayment(req.body, userId);

      res.status(201).json({
        success: true,
        data: payment,
        message: 'Payment recorded successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}
