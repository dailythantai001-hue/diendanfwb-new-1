import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

export function postImageUrls(post: { image_urls?: string[] | null; image_url?: string | null }): string[] {
  return [...new Set([...(post.image_urls || []), ...(post.image_url ? [post.image_url] : [])])];
}

/** Only the configured bucket's public domain/endpoint is allowed; never accept client-supplied keys. */
export function reviewImageKey(raw: string, domain: string, endpoint: string, bucket: string): string | null {
  try {
    const url = new URL(raw), publicUrl = new URL(domain), api = new URL(endpoint);
    let path: string;
    if (url.origin === publicUrl.origin) {
      const prefix = publicUrl.pathname.replace(/\/+$/, "") + "/";
      if (!url.pathname.startsWith(prefix)) return null;
      path = url.pathname.slice(prefix.length);
    } else if (url.origin === api.origin && url.pathname.startsWith(`/${bucket}/`)) {
      path = url.pathname.slice(bucket.length + 2);
    } else return null;
    const key = decodeURIComponent(path);
    if (!/^[a-zA-Z0-9._/-]{1,180}$/.test(key) || key.split("/").some(part => part === ".." || part === ".")) return null;
    return key;
  } catch { return null; }
}

export function prepareReviewImageCleanup(urls: string[]) {
  if (!urls.length) return async () => 0;
  const endpoint = process.env["R2_ENDPOINT"], bucket = process.env["R2_BUCKET_NAME"];
  const domain = process.env["R2_PUBLIC_DOMAIN"], accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
  if (!endpoint || !bucket || !domain || !accessKeyId || !secretAccessKey) throw new Error("Thiếu cấu hình xóa ảnh R2; bài viết chưa bị xóa");
  const keys = [...new Set(urls.map(url => reviewImageKey(url, domain, endpoint, bucket)).filter((key): key is string => key !== null))];
  const client = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });
  return async () => {
    let failed = 0;
    for (const key of keys) {
      let removed = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); removed = true; break; }
        catch { /* retry idempotent deletion without logging credentials */ }
      }
      if (!removed) failed++;
    }
    return failed;
  };
}