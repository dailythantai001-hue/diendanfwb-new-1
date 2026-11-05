import { createFileRoute } from "@tanstack/react-router";
import {
  S3Client,
  ListObjectsV2Command,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  R2_CACHE_CONTROL,
  R2_DEFAULT_CORS_ORIGINS,
  R2_UPLOAD_HEADERS,
  R2_UPLOAD_METHODS,
  evalR2Cors,
  type R2CorsRule,
} from "@/lib/media/r2-cors-eval";

/**
 * Chẩn đoán + cấu hình CORS cho bucket Cloudflare R2.
 *
 * POST /api/public/r2-cors (mọi user đã đăng nhập):
 *   - Kiểm tra credentials (ListObjectsV2), chữ ký + quyền ghi (presigned PUT
 *     chạy ngay trên server), đọc CORS hiện tại của bucket và đánh giá xem
 *     origin/method/headers của trình duyệt có được phép không.
 *   → giúp phân biệt lỗi CORS với lỗi xác thực / chữ ký / quyền bucket.
 *
 * PUT /api/public/r2-cors (chỉ admin, profiles.is_admin trên Supabase 1):
 *   - Áp dụng cấu hình CORS chuẩn cho bucket (AllowedMethods GET/PUT/POST/HEAD,
 *     AllowedHeaders content-type + cache-control, các origin deploy chính thức).
 *   - KHÔNG bao giờ tự chạy: phải do admin gọi rõ ràng.
 *
 * Secrets R2_* đọc từ env của server; admin có thể gửi `override` tạm (như
 * r2-test) — chỉ tồn tại trong RAM của request, không lưu anywhere.
 */

const SUPABASE_URL = "https://gxfxqbhxoghdhokwjpex.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, PUT, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const ENV_KEYS = [
  "R2_ENDPOINT",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_DOMAIN",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
] as const;

const OVERRIDE_OK = (v?: string) =>
  typeof v === "string" && /^[\x20-\x7e]{1,512}$/.test(v.trim()) && v.trim().length > 0;

function bearer(request: Request): string {
  const auth = request.headers.get("authorization") || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

async function getUserId(request: Request): Promise<string | null> {
  const token = bearer(request);
  if (!token) return null;
  try {
    const url = process.env["SUPABASE_URL"] || SUPABASE_URL;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || SUPABASE_PUBLISHABLE_KEY;
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string };
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/** Admin = profiles.is_admin trên SB1, đọc bằng token của chính user (server-side). */
async function isAdmin(userId: string, token: string): Promise<boolean> {
  try {
    const url = process.env["SUPABASE_URL"] || SUPABASE_URL;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || SUPABASE_PUBLISHABLE_KEY;
    const res = await fetch(
      `${url}/rest/v1/profiles?select=is_admin&id=eq.${encodeURIComponent(userId)}&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as { is_admin?: boolean }[];
    return rows?.[0]?.is_admin === true;
  } catch {
    return false;
  }
}

interface OverrideConfig {
  endpoint?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

function resolveConfig(ov: OverrideConfig | undefined) {
  const useOverride =
    !!ov &&
    OVERRIDE_OK(ov.endpoint) &&
    OVERRIDE_OK(ov.bucket) &&
    OVERRIDE_OK(ov.accessKeyId) &&
    OVERRIDE_OK(ov.secretAccessKey) &&
    /^https:\/\/[a-z0-9.-]+\.r2\.cloudflarestorage\.com$/i.test(ov.endpoint!.trim());
  const endpoint = useOverride ? ov!.endpoint!.trim() : process.env["R2_ENDPOINT"];
  const bucket = useOverride ? ov!.bucket!.trim() : process.env["R2_BUCKET_NAME"];
  const accessKeyId = useOverride ? ov!.accessKeyId!.trim() : process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = useOverride
    ? ov!.secretAccessKey!.trim()
    : process.env["R2_SECRET_ACCESS_KEY"];
  const missing = useOverride
    ? []
    : ENV_KEYS.filter(
        (k) => k !== "R2_PUBLIC_DOMAIN" && !process.env[k],
      );
  return { useOverride, endpoint, bucket, accessKeyId, secretAccessKey, missing };
}

function s3Err(e: unknown): { name: string; message: string; status?: number } {
  const err = e as Error & { $metadata?: { httpStatusCode?: number } };
  return {
    name: err?.name || "Error",
    message: err?.message || String(e),
    status: err?.$metadata?.httpStatusCode,
  };
}

function makeClient(endpoint: string, accessKeyId: string, secretAccessKey: string) {
  return new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });
}

/** Presigned PUT 1 byte chạy ngay trên server — chứng minh chữ ký + quyền ghi OK. */
async function serverWriteTest(
  client: S3Client,
  bucket: string,
): Promise<{ ok: boolean; error?: { name: string; message: string; status?: number }; key?: string }> {
  const key = `_diag/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
  try {
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: "text/plain",
        CacheControl: R2_CACHE_CONTROL,
      }),
      { expiresIn: 120 },
    );
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": "text/plain", "cache-control": R2_CACHE_CONTROL },
      body: "ok",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: { name: `HTTP ${res.status}`, message: text.slice(0, 300) } };
    }
  } catch (e) {
    return { ok: false, error: s3Err(e) };
  }
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch { /* file dọn dẹp, bỏ qua lỗi */ }
  return { ok: true, key };
}

async function readCors(
  client: S3Client,
  bucket: string,
): Promise<{ rules: R2CorsRule[]; error?: { name: string; message: string } }> {
  try {
    const out = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    return { rules: (out.CORSRules ?? []) as R2CorsRule[] };
  } catch (e) {
    const err = s3Err(e);
    // Bucket chưa bật CORS → R2 trả NoSuchCORSConfiguration, coi như 0 rules.
    if (/NoSuchCORSConfiguration/i.test(err.name) || /NoSuchCORS/i.test(err.message)) {
      return { rules: [] };
    }
    return { rules: [], error: { name: err.name, message: err.message } };
  }
}

function normalizeOrigin(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/r2-cors")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { headers: cors }),

      POST: async ({ request }) => {
        const userId = await getUserId(request);
        if (!userId) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: cors });
        }

        let body: { origin?: string; override?: OverrideConfig } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch { /* body rỗng cũng được */ }

        const cfg = resolveConfig(body.override);
        if (cfg.missing.length) {
          return Response.json(
            {
              error: "Cloudflare R2 chưa được cấu hình.",
              detail: `Thiếu biến môi trường: ${cfg.missing.join(", ")}`,
              missing: cfg.missing,
            },
            { status: 503, headers: cors },
          );
        }

        const origin = normalizeOrigin(body.origin || request.headers.get("origin") || "") ?? "";

        const client = makeClient(cfg.endpoint!, cfg.accessKeyId!, cfg.secretAccessKey!);

        // 1) Credentials + quyền đọc bucket.
        let credentials: { ok: boolean; error?: { name: string; message: string; status?: number } };
        try {
          await client.send(new ListObjectsV2Command({ Bucket: cfg.bucket!, MaxKeys: 1 }));
          credentials = { ok: true };
        } catch (e) {
          credentials = { ok: false, error: s3Err(e) };
        }

        // 2) Chữ ký + quyền ghi (PUT presigned chạy trên server — không qua CORS).
        const writeTest = credentials.ok
          ? await serverWriteTest(client, cfg.bucket!)
          : { ok: false as const, error: { name: "Skipped", message: "credentials lỗi" } };

        // 3) CORS hiện tại của bucket.
        const corsRead = await readCors(client, cfg.bucket!);
        const evaluated = evalR2Cors(corsRead.rules, origin, "PUT", R2_UPLOAD_HEADERS);

        return Response.json(
          {
            ok: true,
            origin,
            credentials,
            writeTest,
            cors: {
              rules: corsRead.rules,
              readError: corsRead.error,
              evaluated,
            },
          },
          { headers: { ...cors, "cache-control": "no-store" } },
        );
      },

      PUT: async ({ request }) => {
        const userId = await getUserId(request);
        if (!userId) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: cors });
        }
        const token = bearer(request);
        if (!(await isAdmin(userId, token))) {
          return Response.json(
            { error: "Forbidden — chỉ admin mới được áp dụng CORS cho bucket." },
            { status: 403, headers: cors },
          );
        }

        let body: { origins?: string[]; override?: OverrideConfig } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch { /* dùng mặc định */ }

        const cfg = resolveConfig(body.override);
        if (cfg.missing.length) {
          return Response.json(
            {
              error: "Cloudflare R2 chưa được cấu hình.",
              detail: `Thiếu biến môi trường: ${cfg.missing.join(", ")}`,
              missing: cfg.missing,
            },
            { status: 503, headers: cors },
          );
        }

        const requested = (body.origins ?? R2_DEFAULT_CORS_ORIGINS)
          .map((o) => normalizeOrigin(String(o)))
          .filter((o): o is string => !!o);
        if (!requested.length) {
          return Response.json({ error: "Danh sách origins không hợp lệ." }, { status: 400, headers: cors });
        }

        const client = makeClient(cfg.endpoint!, cfg.accessKeyId!, cfg.secretAccessKey!);
        try {
          await client.send(
            new PutBucketCorsCommand({
              Bucket: cfg.bucket!,
              CORSConfiguration: {
                CORSRules: [
                  {
                    AllowedOrigins: requested,
                    AllowedMethods: R2_UPLOAD_METHODS as unknown as ("GET" | "PUT" | "POST" | "HEAD")[],
                    AllowedHeaders: R2_UPLOAD_HEADERS,
                    ExposeHeaders: ["etag"],
                    MaxAgeSeconds: 86400,
                  },
                ],
              },
            }),
          );
        } catch (e) {
          const err = s3Err(e);
          return Response.json(
            { ok: false, error: "Áp dụng CORS thất bại.", detail: `${err.name}: ${err.message}`, status: err.status },
            { status: 502, headers: cors },
          );
        }

        // Đọc lại để xác nhận cấu hình đã ăn.
        const confirm = await readCors(client, cfg.bucket!);
        return Response.json(
          {
            ok: confirm.rules.length > 0,
            applied: [
              {
                AllowedOrigins: requested,
                AllowedMethods: R2_UPLOAD_METHODS,
                AllowedHeaders: R2_UPLOAD_HEADERS,
                ExposeHeaders: ["etag"],
                MaxAgeSeconds: 86400,
              },
            ],
            confirmed: confirm.rules,
            origins: requested,
          },
          { headers: { ...cors, "cache-control": "no-store" } },
        );
      },
    },
  },
});
