import mongoose from 'mongoose';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import AIConversationThread, { IAIConversationMessage } from '../models/AIConversationThread';
import { createAIAgent } from '../ai/agent';

/** Remove fabricated tool-call JSON and boilerplate that local models often output */
function sanitizeResponse(text: string): string {
  let out = text;
  // Remove ```json ... ``` blocks containing execute_mongo_query
  out = out.replace(/```(?:json)?\s*[\s\S]*?execute_mongo_query[\s\S]*?```/gi, '');
  // Remove "Let's run the query:", "Let's correct the tool call:", etc.
  out = out.replace(/\n*(?:Let's run the query|Let's correct the tool call|Now, let's run)[^.\n]*[.\n]*/gi, '');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function extractTextFromMessage(msg: BaseMessage): string {
  const c = (msg as { content?: string | unknown[] }).content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return (c as Array<{ type?: string; text?: string }>)
      .map((block) => (block?.type === 'text' ? block.text : String(block)))
      .filter(Boolean)
      .join('');
  }
  return JSON.stringify(c ?? '');
}

export class AIService {
  /**
   * Send a message and get AI response. Creates thread if threadId not provided.
   */
  static async chat(userId: string, message: string, threadId?: string): Promise<{
    threadId: string;
    response: string;
    messages: IAIConversationMessage[];
  }> {
    let thread = threadId
      ? await AIConversationThread.findOne({ _id: threadId, userId: new mongoose.Types.ObjectId(userId) })
      : null;

    if (!thread) {
      thread = await AIConversationThread.create({
        userId: new mongoose.Types.ObjectId(userId),
        title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
        messages: [],
      });
    }

    // Add user message
    const userMsg: IAIConversationMessage = {
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    thread.messages.push(userMsg);

    // Build messages for agent (convert to langchain format)
    const agentMessages = thread.messages.map((m) =>
      m.role === 'user'
        ? new HumanMessage(m.content)
        : new AIMessage(typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
    );

    const agent = createAIAgent();
    const result = await agent.invoke({
      messages: agentMessages,
    });

    // Extract last AI message content
    const lcMessages = (result.messages ?? []) as BaseMessage[];
    const lastAi = [...lcMessages].reverse().find((m) => AIMessage.isInstance(m));
    let response = lastAi ? extractTextFromMessage(lastAi) : 'I apologize, I could not generate a response.';
    response = sanitizeResponse(response);

    // Add assistant message to thread
    const assistantMsg: IAIConversationMessage = {
      role: 'assistant',
      content: response,
      timestamp: new Date(),
    };
    thread.messages.push(assistantMsg);

    // Update title from first user message if still default
    if (thread.messages.length === 2 && thread.title === (message.slice(0, 50) + (message.length > 50 ? '...' : ''))) {
      thread.title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
    }

    await thread.save();

    return {
      threadId: thread._id.toString(),
      response,
      messages: thread.messages,
    };
  }

  static async listThreads(userId: string): Promise<{ _id: string; title: string; updatedAt: Date }[]> {
    const threads = await AIConversationThread.find({ userId: new mongoose.Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .select('_id title updatedAt')
      .lean();
    return threads.map((t) => ({
      _id: t._id.toString(),
      title: t.title,
      updatedAt: t.updatedAt,
    }));
  }

  static async createThread(userId: string, title?: string): Promise<{ _id: string; title: string }> {
    const thread = await AIConversationThread.create({
      userId: new mongoose.Types.ObjectId(userId),
      title: title || 'New chat',
      messages: [],
    });
    return { _id: thread._id.toString(), title: thread.title };
  }

  static async getThread(userId: string, threadId: string): Promise<{ _id: string; title: string; messages: IAIConversationMessage[] } | null> {
    const thread = await AIConversationThread.findOne({
      _id: threadId,
      userId: new mongoose.Types.ObjectId(userId),
    }).lean();
    if (!thread) return null;
    return {
      _id: thread._id.toString(),
      title: thread.title,
      messages: thread.messages,
    };
  }
}
