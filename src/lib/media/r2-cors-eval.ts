/**
 * Đánh giá CORS rules của bucket Cloudflare R2 (pure, dùng chung server + test).
 *
 * R2 CORS được quản trị qua S3 API (GetBucketCors/PutBucketCors); module này
 * chỉ biến danh sách rules thành verdict "origin + method + headers có được
 * phép không" để phân biệt lỗi CORS với lỗi credentials/chữ ký.
 */

export const R2_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Headers browser thực sự gửi khi PUT presigned URL (xem media/providers/r2.ts). */
export const R2_UPLOAD_HEADERS = ["content-type", "cache-control"];

export const R2_UPLOAD_METHODS = ["GET", "PUT", "POST", "HEAD"];

/**
 * Origin mặc định cần cho phép: hai nền tảng deploy của website + bản preview
 * Lovable (để kiểm thử trong sandbox) + localhost khi dev.
 */
export const R2_DEFAULT_CORS_ORIGINS = [
  "https://fwbvietnam.pages.dev",
  "https://fwbvietnam.vercel.app",
  "https://id-preview--b02bd341-2d35-45b8-9171-dfe25153e23f.lovable.app",
  "http://localhost:8080",
];

export interface R2CorsRule {
  AllowedOrigins?: string[];
  AllowedMethods?: string[];
  AllowedHeaders?: string[];
  ExposeHeaders?: string[];
  MaxAgeSeconds?: number;
}

/** S3 wildcard: "*" hoặc "x-amz-*" / "*-suffix" kiểu tiền tố/hậu tố. */
function wildcardMatch(pattern: string, value: string): boolean {
  if (pattern === "*") return true;
  const p = pattern.toLowerCase();
  const v = value.toLowerCase();
  if (p.startsWith("*") && p.endsWith("*")) {
    const mid = p.slice(1, -1);
    return mid === "" || v.includes(mid);
  }
  if (p.endsWith("*")) return v.startsWith(p.slice(0, -1));
  if (p.startsWith("*")) return v.endsWith(p.slice(1));
  return p === v;
}

function listHas(list: string[] | undefined, value: string): boolean {
  if (!list || list.length === 0) return false;
  return list.some((item) => wildcardMatch(String(item), value));
}

export interface R2CorsEval {
  covered: boolean;
  reasons: string[];
}

/**
 * Kiểm tra một rule có phủ (origin, method, headers) không.
 * headers rỗng: rule thiếu AllowedHeaders vẫn chấp nhận (browser không cần
 * preflight header nào); có headers thì mỗi header phải được phép.
 */
export function ruleCovers(
  rule: R2CorsRule,
  origin: string,
  method: string,
  headers: string[],
): boolean {
  if (!listHas(rule.AllowedOrigins, origin)) return false;
  if (!listHas(rule.AllowedMethods, method)) return false;
  if (headers.length > 0) {
    const allowed = rule.AllowedHeaders ?? [];
    for (const h of headers) {
      if (!listHas(allowed, h)) return false;
    }
  }
  return true;
}

/** Verdict: CORS rules của bucket có cho phép origin/method/headers này không. */
export function evalR2Cors(
  rules: R2CorsRule[] | null | undefined,
  origin: string,
  method: string,
  headers: string[],
): R2CorsEval {
  if (!rules || rules.length === 0) {
    return {
      covered: false,
      reasons: ["Bucket chưa có cấu hình CORS nào (NoSuchCORSConfiguration)."],
    };
  }
  const reasons: string[] = [];
  for (const rule of rules) {
    if (ruleCovers(rule, origin, method, headers)) return { covered: true, reasons: [] };
  }
  const origins = rules.flatMap((r) => r.AllowedOrigins ?? []).filter(Boolean);
  const methods = rules.flatMap((r) => r.AllowedMethods ?? []).filter(Boolean);
  const hdrs = rules.flatMap((r) => r.AllowedHeaders ?? []).filter(Boolean);
  if (!origins.some((o) => wildcardMatch(String(o), origin))) {
    reasons.push(`Origin ${origin || "(trống)"} không nằm trong AllowedOrigins.`);
  }
  if (!methods.some((m) => wildcardMatch(String(m), method))) {
    reasons.push(`Method ${method} không nằm trong AllowedMethods.`);
  }
  const allowedHeaders = hdrs;
  for (const h of headers) {
    if (!allowedHeaders.some((p) => wildcardMatch(String(p), h))) {
      reasons.push(`Header ${h} không nằm trong AllowedHeaders.`);
    }
  }
  return { covered: false, reasons };
}
