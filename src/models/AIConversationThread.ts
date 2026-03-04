import mongoose, { Schema } from 'mongoose';

export interface IAIConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface IAIConversationThread {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  messages: IAIConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IAIConversationMessage>(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const threadSchema = new Schema<IAIConversationThread>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: 'New chat' },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true }
);

threadSchema.index({ userId: 1, updatedAt: -1 });

const AIConversationThread = mongoose.model<IAIConversationThread>('AIConversationThread', threadSchema);
export default AIConversationThread;
