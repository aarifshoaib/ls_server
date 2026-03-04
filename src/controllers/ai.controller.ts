import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { AIService } from '../services/ai.service';

export class AIController {
  static async chat(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { threadId, message } = req.body;
      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ success: false, error: 'Message is required' });
        return;
      }
      const result = await AIService.chat(userId, message.trim(), threadId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async listThreads(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const threads = await AIService.listThreads(userId);
      res.json({ success: true, data: threads });
    } catch (error) {
      next(error);
    }
  }

  static async createThread(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { title } = req.body;
      const thread = await AIService.createThread(userId, title);
      res.json({ success: true, data: thread });
    } catch (error) {
      next(error);
    }
  }

  static async getThread(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { id } = req.params;
      const thread = await AIService.getThread(userId, id);
      if (!thread) {
        res.status(404).json({ success: false, error: 'Thread not found' });
        return;
      }
      res.json({ success: true, data: thread });
    } catch (error) {
      next(error);
    }
  }
}
