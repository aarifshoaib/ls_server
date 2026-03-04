import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { PaymentService } from '../services/payment.service';

export class PaymentController {
  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const userRole = (req.user?.role || '') as string;

      if (PaymentService.requiresApproval(userRole as any)) {
        const request = await PaymentService.submitPaymentRequest(req.body, userId);
        res.status(201).json({
          success: true,
          pendingApproval: true,
          data: request,
          message: 'Payment request submitted for approval',
        });
        return;
      }

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

  static async getPendingApprovals(_req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const requests = await PaymentService.getPendingApprovals();
      res.json({
        success: true,
        data: requests,
      });
    } catch (error) {
      next(error);
    }
  }

  static async approve(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const { notes } = req.body || {};
      const payment = await PaymentService.approvePaymentRequest(req.params.id, userId, notes);

      res.json({
        success: true,
        data: payment,
        message: 'Payment approved and recorded successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async reject(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const { rejectionReason } = req.body || {};
      const request = await PaymentService.rejectPaymentRequest(req.params.id, userId, rejectionReason);

      res.json({
        success: true,
        data: request,
        message: 'Payment request rejected',
      });
    } catch (error) {
      next(error);
    }
  }
}
