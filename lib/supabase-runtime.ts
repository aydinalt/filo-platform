import postgres, { type Sql } from "postgres";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSqliteQuery } from "./sql-compat";

type BoundValue = string | number | boolean | null | Uint8Array | ArrayBuffer;

type D1ResultShape<T = Record<string, unknown>> = {
  results: T[];
  success: boolean;
  meta: { changes: number; duration: number; last_row_id: number };
};

function normalizeValue(value: BoundValue) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return value;
}

function normalizeRow<T>(row: T): T {
  if (!row || typeof row !== "object") return row;
  return Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])) as T;
}

class PostgresPreparedStatement {
  private values: BoundValue[] = [];

  constructor(private readonly client: Sql, private readonly source: string) {}

  bind(...values: BoundValue[]) {
    this.values = values.map(normalizeValue);
    return this;
  }

  private async execute<T>() {
    const rows = await this.client.unsafe(normalizeSqliteQuery(this.source), this.values as never[]) as unknown as T[] & { count?: number };
    return { rows: Array.from(rows, normalizeRow), count: Number(rows.count ?? rows.length ?? 0) };
  }

  async first<T>() {
    const { rows } = await this.execute<T>();
    return rows[0] ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<D1ResultShape<T>> {
    const started = performance.now();
    const { rows, count } = await this.execute<T>();
    return { results: rows, success: true, meta: { changes: count, duration: performance.now() - started, last_row_id: 0 } };
  }

  async run<T = Record<string, unknown>>(): Promise<D1ResultShape<T>> {
    return this.all<T>();
  }
}

class PostgresD1Adapter {
  constructor(private readonly client: Sql) {}

  prepare(query: string) {
    return new PostgresPreparedStatement(this.client, query);
  }

  async batch(statements: PostgresPreparedStatement[]) {
    return this.client.begin(async transaction => {
      const adapter = new PostgresD1Adapter(transaction as unknown as Sql);
      const results = [];
      for (const statement of statements) {
        const source = (statement as unknown as { source: string }).source;
        const values = (statement as unknown as { values: BoundValue[] }).values;
        results.push(await adapter.prepare(source).bind(...values).run());
      }
      return results;
    });
  }
}

export function createPostgresD1Adapter(client: Sql): D1Database {
  return new PostgresD1Adapter(client) as unknown as D1Database;
}

class SupabaseStorageAdapter {
  constructor(private readonly client: SupabaseClient, private readonly bucket: string) {}

  async put(key: string, value: ArrayBuffer | Uint8Array | ReadableStream, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) {
    const body = value instanceof ReadableStream ? await new Response(value).arrayBuffer() : value;
    const { error } = await this.client.storage.from(this.bucket).upload(key, body, {
      contentType: options?.httpMetadata?.contentType,
      metadata: options?.customMetadata,
      upsert: false,
    });
    if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
    return { key };
  }

  async get(key: string) {
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error?.message?.toLowerCase().includes("not found")) return null;
    if (error || !data) throw new Error(`Supabase Storage download failed: ${error?.message || "empty object"}`);
    return { body: data.stream(), arrayBuffer: () => data.arrayBuffer() };
  }

  async list(options: { prefix?: string; limit?: number } = {}) {
    const prefix = (options.prefix || "").replace(/^\/+|\/+$/g, "");
    const { data, error } = await this.client.storage.from(this.bucket).list(prefix, { limit: options.limit || 100 });
    if (error) throw new Error(`Supabase Storage list failed: ${error.message}`);
    return { objects: data || [], truncated: false };
  }
}

export function createSupabaseRuntimeEnv() {
  const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!databaseUrl || !supabaseUrl || !serviceRoleKey) throw new Error("Supabase server configuration is incomplete.");
  const sql = postgres(databaseUrl, { max: Number(process.env.SUPABASE_POOL_SIZE || 5), idle_timeout: 20, connect_timeout: 10, prepare: false, ssl: "require" });
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return {
    DB: createPostgresD1Adapter(sql),
    BUCKET: new SupabaseStorageAdapter(supabase, process.env.SUPABASE_STORAGE_BUCKET || "filo-private") as unknown as R2Bucket,
    ...process.env,
  };
}
