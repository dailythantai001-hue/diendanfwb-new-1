/**
 * Cloudflare R2 media provider (presigned PUT).
 *
 * Bảo mật:
 *   • Access Key / Secret CHỈ nằm ở server (env `R2_*`).
 *   • Client xin URL ký sẵn ở `/api/public/r2-sign` (yêu cầu đăng nhập),
 *     rồi PUT thẳng file lên R2 → không đi qua server, không tốn băng thông.
 *   • URL public trả về dạng `https://pub-xxxx.r2.dev/<folder>/<file>`.
 */

import type { MediaProvider, ResourceType, UploadedMedia } from "../types";
import { supabase } from "@/lib/supabase";
import { getR2SessionConfig } from "../r2-session-config";
import { R2_CACHE_CONTROL } from "../r2-cors-eval";

/** Domain public mặc định của bucket R2 (an toàn để lộ — chỉ đọc). */
export const R2_PUBLIC_DOMAIN = "https://pub-877370bd26ca441294f1b74567432e8a.r2.dev";

const R2_URL_RE = /^https?:\/\/(pub-[a-z0-9]+\.r2\.dev|[a-z0-9.-]+\.r2\.cloudflarestorage\.com)\//i;

const ALLOWED_IMAGE = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/apng",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/svg+xml",
]);
const ALLOWED_VIDEO = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"]);
const AUDIO_EXT_RE = /\.(mp3|wav|m4a|ogg|oga|opus|aac|weba|flac|amr)$/i;
const isAudioFile = (file: File | Blob, filename: string) =>
  (file.type || "").toLowerCase().startsWith("audio/") || AUDIO_EXT_RE.test(filename);

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

export interface R2ProviderConfig {
  name?: string;
  signEndpoint?: string;
  enabled?: boolean;
}

function detectResourceType(file: File | Blob, filename = ""): ResourceType {
  const t = (file.type || "").toLowerCase();
  if (isAudioFile(file, filename)) return "video";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("image/")) return "image";
  if (/\.(mp4|webm|mov|mkv)$/i.test(filename)) return "video";
  if (/\.(jpe?g|png|webp|gif|avif|svg)$/i.test(filename)) return "image";
  return "raw";
}

function assertAllowed(file: File | Blob, filename: string) {
  if (/\.(exe|sh|bat|cmd|jar|apk|msi|php|py|dll|scr)$/i.test(filename)) {
    throw new Error("Định dạng tệp không được phép.");
  }
  const type = (file.type || "").toLowerCase();
  if (ALLOWED_IMAGE.has(type) || /\.(jpe?g|png|webp|gif|avif|svg|apng)$/i.test(filename)) {
    if (file.size > MAX_IMAGE_BYTES) throw new Error("Ảnh vượt quá 15MB.");
    return;
  }
  if (ALLOWED_VIDEO.has(type) || /\.(mp4|webm|mov|mkv)$/i.test(filename)) {
    if (file.size > MAX_VIDEO_BYTES) throw new Error("Video vượt quá 200MB.");
    return;
  }
  if (isAudioFile(file, filename)) {
    if (file.size > MAX_AUDIO_BYTES) throw new Error("Audio vượt quá 30MB.");
    return;
  }
  throw new Error(
    "Chỉ hỗ trợ ảnh (jpg, png, webp, gif), video (mp4, webm, mov) hoặc audio (mp3, wav, m4a, ogg).",
  );
}

function guessContentType(file: File | Blob, filename: string): string {
  if (file.type) return file.type;
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
  };
  return map[ext] || "application/octet-stream";
}

/** Parse lỗi XML kiểu S3 mà R2 trả về khi PUT thất bại với HTTP status rõ ràng. */
function parseS3ErrorXml(text: string): { code?: string; message?: string } {
  const code = /<Code>([^<]+)<\/Code>/i.exec(text)?.[1];
  const message = /<Message>([^<]+)<\/Message>/i.exec(text)?.[1];
  return { code, message };
}

/** HTTP lỗi rõ ràng (không phải CORS): đọc được status + body → nói đúng nguyên nhân. */
function describeS3Status(status: number, body: string): string {
  const { code, message } = parseS3ErrorXml(body);
  if (code === "SignatureDoesNotMatch" || code === "InvalidAccessKeyId") {
    return `R2 từ chối chữ ký tải lên (${code}). Access Key trên server không khớp — không phải lỗi CORS.`;
  }
  if (code === "AccessDenied") {
    return `R2 từ chối (AccessDenied): token R2 không có quyền Object Read & Write trên bucket — không phải lỗi CORS.${message ? ` Chi tiết: ${message}` : ""}`;
  }
  if (code === "NoSuchBucket") {
    return `R2: bucket không tồn tại (${code}) — không phải lỗi CORS.`;
  }
  if (code) return `R2 trả về lỗi ${code}${message ? `: ${message}` : ""} (HTTP ${status}).`;
  return `Tải lên R2 thất bại (HTTP ${status}).`;
}

/**
 * XHR báo lỗi với status 0 → mất mạng, CORS chặn, hoặc DNS/TLS.
 * Hỏi server chẩn đoán (/api/public/r2-cors) để phân biệt CORS với
 * credentials/chữ ký/quyền bucket thay vì báo CORS chung chung.
 */
async function classifyNetworkError(accessToken: string): Promise<Error> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return new Error("R2: mất kết nối mạng. Vui lòng kiểm tra Internet rồi thử lại.");
  }
  try {
    const res = await fetch("/api/public/r2-cors", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ origin: window.location.origin }),
    });
    if (res.status === 401) {
      return new Error("Phiên đăng nhập đã hết hạn khi tải media lên. Vui lòng đăng nhập lại.");
    }
    if (res.status === 503) {
      let detail = "";
      try {
        detail = ((await res.json()) as { detail?: string }).detail || "";
      } catch { /* ignore */ }
      return new Error(`Server chưa cấu hình Cloudflare R2 (${detail}) — không phải lỗi CORS.`);
    }
    const diag = (await res.json()) as {
      credentials?: { ok: boolean; error?: { name: string; message: string } };
      writeTest?: { ok: boolean; error?: { name: string; message: string } };
      cors?: {
        rules?: unknown[];
        evaluated?: { covered: boolean; reasons: string[] };
        readError?: { name: string; message: string };
      };
    };
    if (diag.credentials && diag.credentials.ok === false) {
      const e = diag.credentials.error;
      return new Error(
        `R2: kiểm tra credentials trên server thất bại (${e?.name}: ${e?.message}) — không phải lỗi CORS.`,
      );
    }
    if (diag.writeTest && diag.writeTest.ok === false) {
      const e = diag.writeTest.error;
      return new Error(
        `R2: server tự PUT thử cũng thất bại (${e?.name}: ${e?.message}) — lỗi chữ ký/quền bucket, không phải CORS.`,
      );
    }
    const ev = diag.cors?.evaluated;
    if (ev && ev.covered === false) {
      console.error(
        "[r2-upload] bucket cần CORS cho origin:",
        window.location.origin,
        "— CORS hiện tại:",
        diag.cors?.rules,
        "— lý do:",
        ev.reasons,
      );
      return new Error(
        `Bucket R2 chưa cho phép truy cập từ ${window.location.origin} (CORS). Lý do: ${ev.reasons.join(" ")} Admin áp dụng cấu hình chuẩn qua Quản trị → R2, hoặc Cloudflare Dashboard → R2 → bucket → Settings → CORS policy.`,
      );
    }
    if (diag.cors?.readError) {
      return new Error(
        `R2: không đọc được CORS của bucket (${diag.cors.readError.name}: ${diag.cors.readError.message}).`,
      );
    }
    return new Error("R2: lỗi mạng khi tải lên (chẩn đoán server không tìm ra nguyên nhân cụ thể).");
  } catch {
    return new Error("R2: lỗi mạng hoặc bucket chưa bật CORS cho tên miền này.");
  }
}

export function createR2Provider(config: R2ProviderConfig = {}): MediaProvider {
  const name = config.name ?? "cloudflare-r2";
  const signEndpoint = config.signEndpoint ?? "/api/public/r2-sign";

  return {
    name,

    isEnabled() {
      return config.enabled !== false;
    },

    ownsUrl(url) {
      return R2_URL_RE.test(url);
    },

    async upload(file, filename, opts): Promise<UploadedMedia> {
      assertAllowed(file, filename);
      const resourceType = detectResourceType(file, filename);
      const folder = String(opts.folder || "candy").replace(/^\/+|\/+$/g, "");
      const contentType = guessContentType(file, filename);

      let accessToken: string | undefined;
      try {
        const { data } = await supabase.auth.getSession();
        accessToken = data.session?.access_token;
      } catch {
        /* ignore */
      }
      if (!accessToken) throw new Error("Cần đăng nhập để tải media lên.");
      const token: string = accessToken;

      let signRes: Response;
      try {
        signRes = await fetch(signEndpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            folder,
            filename,
            contentType,
            // Cấu hình tạm do admin nhập trong phiên test (nếu có) — chỉ nằm
            // trong RAM tab hiện tại, gửi kèm request để ký bằng key đó.
            override: getR2SessionConfig() ?? undefined,
          }),
          signal: opts.signal,
        });
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") throw e;
        console.error("[r2-upload] sign fetch lỗi mạng:", e);
        throw new Error("Không kết nối được server ký URL tải lên (lỗi mạng) — không phải lỗi CORS của R2.");
      }
      if (!signRes.ok) {
        let detail = "";
        try {
          const err = (await signRes.json()) as { error?: string; detail?: string };
          detail = err?.detail || err?.error || "";
        } catch {
          /* ignore */
        }
        throw new Error(
          `Không lấy được chữ ký tải lên R2 (${signRes.status})${detail ? `: ${detail}` : ""}`,
        );
      }
      const sign = (await signRes.json()) as {
        uploadUrl: string;
        key: string;
        publicUrl: string;
        contentType: string;
      };

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", sign.uploadUrl);
        xhr.setRequestHeader("content-type", sign.contentType || contentType);
        // Khớp CacheControl mà server đã ký vào presigned URL — thiếu header này
        // R2 trả SignatureDoesNotMatch (browser hiển thị như status 0).
        xhr.setRequestHeader("cache-control", R2_CACHE_CONTROL);
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable && opts.onProgress) {
            opts.onProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else {
            console.error("[r2-upload] response", { status: xhr.status, body: xhr.responseText });
            reject(new Error(describeS3Status(xhr.status, xhr.responseText || "")));
          }
        };
        xhr.onerror = () => {
          void classifyNetworkError(token).then(reject, reject);
        };
        xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
        if (opts.signal) {
          if (opts.signal.aborted) xhr.abort();
          else opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
        }
        xhr.send(file);
      });

      opts.onProgress?.(100);

      return {
        provider: name,
        publicId: sign.key,
        secureUrl: sign.publicUrl,
        resourceType,
        bytes: (file as File).size ?? 0,
        createdAt: new Date().toISOString(),
      };
    },

    /** R2 phục vụ file gốc — không có transformation phía CDN. */
    buildUrl(url) {
      return url;
    },

    buildThumb(url) {
      return url;
    },
  };
}
