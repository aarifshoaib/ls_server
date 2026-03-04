import mongoose from 'mongoose';
import { z } from 'zod';

const ALLOWED_AGGREGATE_STAGES = ['$match', '$project', '$group', '$sort', '$limit', '$unwind', '$lookup'];

function containsDangerousOperation(obj: unknown): boolean {
  if (obj === null || obj === undefined) return false;
  if (typeof obj === 'string') {
    const lower = obj.toLowerCase();
    return ['insert', 'update', 'delete', 'drop', 'remove', '$set', '$unset', '$push', '$pull', '$rename'].some(
      (op) => lower.includes(op)
    );
  }
  if (Array.isArray(obj)) {
    return obj.some((item) => containsDangerousOperation(item));
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj as Record<string, unknown>);
    const dangerous = [
      '$set', '$unset', '$push', '$pull', '$addToSet', '$rename', '$inc', '$mul',
      'insert', 'update', 'delete', 'drop', 'remove', 'insertOne', 'insertMany',
      'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'replaceOne', 'bulkWrite'
    ];
    if (keys.some((k) => dangerous.includes(k))) return true;
    return Object.values(obj as Record<string, unknown>).some((v) => containsDangerousOperation(v));
  }
  return false;
}

function validateAggregatePipeline(pipeline: unknown[]): void {
  for (const stage of pipeline) {
    if (typeof stage !== 'object' || stage === null || !Object.keys(stage).length) {
      throw new Error('Invalid pipeline stage');
    }
    const keys = Object.keys(stage as Record<string, unknown>);
    if (keys.length !== 1) {
      throw new Error('Each pipeline stage must have exactly one key');
    }
    const stageKey = keys[0];
    if (!ALLOWED_AGGREGATE_STAGES.includes(stageKey)) {
      throw new Error(`Pipeline stage "${stageKey}" is not allowed. Allowed: ${ALLOWED_AGGREGATE_STAGES.join(', ')}`);
    }
    if (containsDangerousOperation(stage)) {
      throw new Error('Pipeline contains dangerous operations');
    }
  }
}

const FindQuerySchema = z.object({
  operation: z.literal('find'),
  collection: z.string().min(1),
  filter: z.record(z.string(), z.unknown()).optional().default({}),
  projection: z.record(z.string(), z.union([z.number(), z.boolean()])).optional(),
  sort: z.record(z.string(), z.union([z.literal(1), z.literal(-1)])).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

const AggregateQuerySchema = z.object({
  operation: z.literal('aggregate'),
  collection: z.string().min(1),
  pipeline: z.array(z.record(z.string(), z.unknown())),
});

const QuerySchema = z.discriminatedUnion('operation', [FindQuerySchema, AggregateQuerySchema]);

export type MongoQueryInput = z.infer<typeof QuerySchema>;

export async function executeQuery(input: MongoQueryInput): Promise<string> {
  const parsed = QuerySchema.safeParse(input);
  if (!parsed.success) {
    return JSON.stringify({ error: `Invalid query: ${parsed.error.message}` });
  }

  const { operation, collection } = parsed.data;

  if (containsDangerousOperation(parsed.data)) {
    return JSON.stringify({ error: 'Query contains disallowed write/delete operations' });
  }

  const db = mongoose.connection.db;
  if (!db) {
    return JSON.stringify({ error: 'Database not connected' });
  }

  const coll = db.collection(collection);

  try {
    if (operation === 'find') {
      const { filter = {}, projection, sort, limit } = parsed.data;
      let cursor = coll.find(filter);
      if (projection && Object.keys(projection).length > 0) cursor = cursor.project(projection);
      if (sort && Object.keys(sort).length > 0) cursor = cursor.sort(sort as Record<string, 1 | -1>);
      if (limit) cursor = cursor.limit(limit);
      const docs = await cursor.toArray();
      return JSON.stringify(docs, null, 0);
    } else {
      const { pipeline } = parsed.data;
      validateAggregatePipeline(pipeline);
      const docs = await coll.aggregate(pipeline).toArray();
      return JSON.stringify(docs, null, 0);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return JSON.stringify({ error: `Query failed: ${message}` });
  }
}
