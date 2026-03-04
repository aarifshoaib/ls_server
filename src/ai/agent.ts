import { createAgent, tool } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOllama } from '@langchain/ollama';
import { z } from 'zod';
import { config } from '../config';
import { executeQuery } from './queryTool';
import * as fs from 'fs';
import * as path from 'path';

const schemasPath = path.join(__dirname, 'model-schemas.json');
const schemasJson = fs.readFileSync(schemasPath, 'utf-8');
const schemaDoc = JSON.parse(schemasJson);

const SCHEMA_CONTEXT = schemaDoc.collections
  .map(
    (c: { name: string; description: string; fields: { name: string; type: string; enum?: string[] }[] }) =>
      `- **${c.name}**: ${c.description}. Fields: ${c.fields.map((f: { name: string; type: string; enum?: string[] }) => f.name + (f.enum ? ` (${f.enum.join('|')})` : '')).join(', ')}`
  )
  .join('\n');

const SYSTEM_PROMPT = `You are an AI assistant for an Order Management System (OMS). You answer questions by querying the MongoDB database.

## Available collections and schemas
${SCHEMA_CONTEXT}

## Query tool
You have a tool "execute_mongo_query" that runs READ-ONLY MongoDB queries. It accepts:
1. **find**: { operation: "find", collection: "string", filter?: object, projection?: object, sort?: object, limit?: number }
2. **aggregate**: { operation: "aggregate", collection: "string", pipeline: array }

- Collection names are lowercase plural (e.g., products, orders, customers, stockbatches, leaves, attendances, employees, shopvisits, purchaseorders, purchaseinvoices, purchasereturns, vendors).
- For date filters use: { createdAt: { $gte: "2024-01-01", $lte: "2024-12-31" } } (strings work)
- Use $regex for text search: { name: { $regex: "search", $options: "i" } }
- For "this month" use: start and end of current month as ISO strings.
- For "this week" use: start and end of current week.
- Limit results to 50 unless user asks for more.
- Use $lookup to join when needed. Allowed stages: $match, $project, $group, $sort, $limit, $unwind, $lookup.

## CRITICAL RULES - NEVER BREAK THESE
1. **Greetings**: If user says hi, hello, hey - respond with ONE short friendly line. Do NOT use the tool.
2. **Never fabricate data**: ONLY show what the tool actually returned. Never invent product IDs (e.g. 1234, 5678), SKUs (e.g. ABCD-001), or numbers. If the tool returns [] or no rows, say "No results found" - do NOT make up a table.
3. **Never output JSON/code**: Do not show "execute_mongo_query", tool parameters, "Let's run the query", or code blocks. The tool runs automatically - just show the real results.
4. **If no tool output**: If you did not receive actual data from the tool, say "I couldn't retrieve the data." Never create example tables.

## Query tool usage
- Call execute_mongo_query ONLY when the user asks for real data (stock count, orders, customers, etc).
- For aggregate, pipeline must be JSON array with double-quoted keys. Example stock total: {"operation":"aggregate","collection":"stockbatches","pipeline":[{"$group":{"_id":null,"total":{"$sum":"$availableQuantity"}}}]}
- stockbatches has availableQuantity; products has variants.
- Format results clearly. Round currency to 2 decimals.`;

function getSystemPrompt(): string {
  const base = SYSTEM_PROMPT;
  if (config.ai.useOllama) {
    return `${base}

[When using local/Ollama: If you did not receive real tool output, say "I couldn't retrieve the data." Do NOT create example tables or fake IDs.]`;
  }
  return base;
}

function getLLM() {
  // Local Llama via Ollama (takes priority when USE_OLLAMA=true) - native API
  if (config.ai.useOllama) {
    return new ChatOllama({
      baseUrl: config.ai.ollamaBaseUrl,
      model: config.ai.ollamaModel,
      temperature: 0.2,
    });
  }
  if (config.ai.anthropicApiKey) {
    return new ChatAnthropic({
      apiKey: config.ai.anthropicApiKey,
      model: 'claude-3-5-sonnet-20241022',
    });
  }
  if (config.ai.openaiApiKey) {
    return new ChatOpenAI({
      apiKey: config.ai.openaiApiKey,
      model: config.ai.defaultModel,
    });
  }
  throw new Error(
    'No AI configured. Set USE_OLLAMA=true for local Llama (Ollama), or OPENAI_API_KEY, or ANTHROPIC_API_KEY in .env'
  );
}

function parseJsonField(val: unknown): Record<string, unknown> | undefined {
  if (val == null) return undefined;
  if (typeof val === 'object') return val as Record<string, unknown>;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return typeof parsed === 'object' ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function normalizeToolInput(input: Record<string, unknown>): Record<string, unknown> {
  // Accept { query }, { parameters }, or flat { operation, collection, ... }
  const q =
    (input.query as Record<string, unknown>) ??
    (input.parameters as Record<string, unknown>) ??
    input;
  const operation = (q.operation as string) || 'find';
  const collection = q.collection as string;
  if (!collection) throw new Error('collection is required');

  if (operation === 'aggregate') {
    let pipeline = q.pipeline;
    if (typeof pipeline === 'string') {
      try {
        pipeline = JSON.parse(pipeline) as unknown[];
      } catch {
        throw new Error('pipeline must be valid JSON array');
      }
    }
    if (!Array.isArray(pipeline)) throw new Error('pipeline must be an array');
    return { operation: 'aggregate', collection, pipeline };
  }

  const filter = parseJsonField(q.filter) ?? {};
  const projection = parseJsonField(q.projection);
  const sort = parseJsonField(q.sort);
  const limit = typeof q.limit === 'number' ? q.limit : undefined;

  return {
    operation: 'find',
    collection,
    filter,
    ...(projection && Object.keys(projection).length > 0 && { projection }),
    ...(sort && Object.keys(sort).length > 0 && { sort }),
    ...(limit && { limit }),
  };
}

const executeMongoQueryTool = tool(
  async (input) => {
    const query = normalizeToolInput(input as Record<string, unknown>);
    const result = await executeQuery(query as Parameters<typeof executeQuery>[0]);
    return result;
  },
  {
    name: 'execute_mongo_query',
    description: 'Execute a read-only MongoDB find or aggregate query. Pass: { operation: "find", collection: "customers", filter: {}, limit: 50 } or { operation: "aggregate", collection: "orders", pipeline: [...] }. Collections: products, orders, customers, stockbatches, leaves, attendances, employees, etc.',
    schema: z.record(z.string(), z.unknown()).describe('MongoDB query: operation, collection, filter?, projection?, sort?, limit? for find; or operation, collection, pipeline for aggregate.'),
  }
);

export function createAIAgent() {
  const model = getLLM();
  return createAgent({
    model,
    tools: [executeMongoQueryTool],
    systemPrompt: getSystemPrompt(),
  });
}
