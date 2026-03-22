import { createAgent, tool } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOllama } from '@langchain/ollama';
import { z } from 'zod';
import { config } from '../config';
import { executeQuery } from './queryTool';
import { EmployeeService } from '../services/employee.service';
import * as fs from 'fs';
import * as path from 'path';

const schemasPath = path.join(__dirname, 'model-schemas.json');
const schemasJson = fs.readFileSync(schemasPath, 'utf-8');
const schemaDoc = JSON.parse(schemasJson);

const SCHEMA_CONTEXT = (schemaDoc.collections || [])
  .map(
    (c: { name: string; description: string; fields: { name: string; type: string; enum?: string[] }[] }) =>
      `- **${c.name}**: ${c.description}. Fields: ${c.fields.map((f: { name: string; type: string; enum?: string[] }) => f.name + (f.enum ? ` (${f.enum.join('|')})` : '')).join(', ')}`
  )
  .join('\n');

const SYSTEM_PROMPT = `You are an AI assistant for an Order Management System (OMS) that includes both OMS (orders, products, customers, inventory, procurement) and Payroll (employees, attendance, leaves, advances, pay cycles). You answer questions by using the available tools. NEVER ask the user which collection or which attributes to use - always infer from their question and the schemas below.

## CRITICAL: NEVER ask clarifying questions - ALWAYS use tools directly
- NEVER ask "which collection?", "which attributes?", "which field stores?", "could you tell me the field name?"
- NEVER ask "is it documentExpiryDate, expiryDate, or something else?" - you have tools that handle this
- For employee document expiry: IMMEDIATELY call get_employee_document_expiry. The tool knows all field names (passport, visa, Emirates ID, etc.) - you do NOT need to ask the user
- ALWAYS infer the right tool and parameters from the user's natural language. Call the tool first, never ask first

## Available collections and schemas (for execute_mongo_query)
${SCHEMA_CONTEXT}

## Tools available

### 1. get_employee_document_expiry (USE THIS - do NOT ask user for field names)
**"Documents" = EMPLOYEE documents** (passport, visa, Emirates ID, labor card, medical insurance, driving license).
- When user asks about employee document expiry in ANY form -> CALL THIS TOOL IMMEDIATELY. Do NOT ask which field, which collection, or any clarifying question.
- The tool internally checks: passport.dateOfExpiry, visas[].dateOfExpiry, emiratesIds[].dateOfExpiry, laborCard.expiryDate, etc. You do NOT need to know or ask.
- daysAhead: 365 for "expired"/"already expired", 30 for "this month", 90 for default.
- Returns both expired and expiring employee documents with employee name, document type, expiry date.

### 2. execute_mongo_query
Use for: **stock batches** (product inventory expiry), orders, customers, attendance, leaves, shop visits, products, etc.
- "Stock batches" / "batch expiry" / "inventory expiring" / "expiring stock" -> query stockbatches collection (product inventory).
- **find**: { operation: "find", collection: "string", filter?: object, projection?: object, sort?: object, limit?: number }
- **aggregate**: { operation: "aggregate", collection: "string", pipeline: array }

- Collection names: products, orders, customers, stockbatches, leaves, attendances, employees, shopvisits, paycycles, payrollruns, advances, purchaseorders, purchaseinvoices, purchasereturns, vendors.
- For date filters: { createdAt: { $gte: "2024-01-01", $lte: "2024-12-31" } }
- Use $regex for text search: { name: { $regex: "search", $options: "i" } }
- For "this month" use start and end of current month as ISO strings.
- Limit results to 50 unless user asks for more.

## Query intent mapping (infer from user question)
- **"documents" = employee documents**: "whose documents expired", "documents already expired", "who documents expiring", "passport/visa/emirates ID expiring" -> get_employee_document_expiry (daysAhead: 365 for "expired/already expired", 30 for "this month", else 90)
- **"stock/batches" = product inventory**: "stock batches expiring", "expiring batches", "inventory expiry", "batch expiry" -> execute_mongo_query on stockbatches
- Orders, sales -> execute_mongo_query on orders
- Customers -> execute_mongo_query on customers
- Attendance, leaves, shop visits -> execute_mongo_query on attendances, leaves, shopvisits
- Payroll, pay cycles, advances, payroll runs -> execute_mongo_query on paycycles, payrollruns, advances

## CRITICAL RULES - NEVER BREAK THESE
1. **Greetings**: If user says hi, hello, hey - respond with ONE short friendly line. Do NOT use tools.
2. **Never fabricate data**: ONLY show what the tool actually returned. Never invent IDs or numbers. If no rows, say "No results found".
3. **Never output JSON/code**: Do not show tool names, parameters, or code blocks - just show the real results.
4. **If no tool output**: Say "I couldn't retrieve the data." Never create example tables.
5. **Infer, don't ask**: Always pick the right tool and parameters from the question. Never ask the user for collection, attribute, or field names.
6. **Document expiry = use tool**: For ANY question about employee documents expiring/expired, call get_employee_document_expiry with daysAhead=365. Never ask "which field stores the expiry date?" - the tool handles it.`;

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
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620',
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
    description: 'Execute a read-only MongoDB find or aggregate query. OMS: products, orders, customers, stockbatches, vendors, purchaseorders, purchaseinvoices, purchasereturns. Payroll: employees, leaves, attendances, paycycles, payrollruns, advances, shopvisits.',
    schema: z.record(z.string(), z.unknown()).describe('MongoDB query: operation, collection, filter?, projection?, sort?, limit? for find; or operation, collection, pipeline for aggregate.'),
  }
);

const getEmployeeDocumentExpiryTool = tool(
  async (input) => {
    const inp = input as { daysAhead?: number };
    const daysAhead = typeof inp?.daysAhead === 'number' ? inp.daysAhead : 90;
    const result = await EmployeeService.getDocumentExpiry(daysAhead);
    return JSON.stringify(result, null, 0);
  },
  {
    name: 'get_employee_document_expiry',
    description: 'Get expired or expiring EMPLOYEE documents. CALL THIS for any employee document expiry question - do NOT ask user for field names. Handles passport, visa, Emirates ID, labor card, medical insurance, driving license internally. "whose documents expired", "documents already expired" -> daysAhead: 365. "this month" -> 30. Default: 90. NEVER ask user which field stores expiry - use this tool.',
    schema: z.object({
      daysAhead: z.number().int().min(1).max(365).optional().describe('Days to look ahead (default 90, use 30 for this month)'),
    }),
  }
);

export function createAIAgent() {
  const model = getLLM();
  return createAgent({
    model,
    tools: [getEmployeeDocumentExpiryTool, executeMongoQueryTool],
    systemPrompt: getSystemPrompt(),
  });
}
