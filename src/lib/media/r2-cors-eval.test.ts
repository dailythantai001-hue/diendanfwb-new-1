import { describe, expect, it } from "vitest";
import {
  evalR2Cors,
  ruleCovers,
  R2_DEFAULT_CORS_ORIGINS,
  R2_UPLOAD_HEADERS,
  type R2CorsRule,
} from "./r2-cors-eval";

const fullRule: R2CorsRule = {
  AllowedOrigins: ["https://fwbvietnam.pages.dev", "https://fwbvietnam.vercel.app"],
  AllowedMethods: ["GET", "PUT", "POST", "HEAD"],
  AllowedHeaders: ["content-type", "cache-control"],
  ExposeHeaders: ["etag"],
  MaxAgeSeconds: 86400,
};

describe("evalR2Cors — CORS bucket R2 có phủ upload từ trình duyệt không", () => {
  it("cấu hình chuẩn cho phép PUT content-type+cache-control từ 2 origin deploy", () => {
    for (const origin of ["https://fwbvietnam.pages.dev", "https://fwbvietnam.vercel.app"]) {
      const ev = evalR2Cors([fullRule], origin, "PUT", R2_UPLOAD_HEADERS);
      expect(ev.covered).toBe(true);
      expect(ev.reasons).toEqual([]);
    }
  });

  it("origin lạ (ví dụ khác domain) bị từ chối và nêu đúng lý do", () => {
    const ev = evalR2Cors([fullRule], "https://evil.example.com", "PUT", R2_UPLOAD_HEADERS);
    expect(ev.covered).toBe(false);
    expect(ev.reasons.some((r) => r.includes("evil.example.com"))).toBe(true);
  });

  it("bucket chưa có CORS nào → không phủ, nêu nguyên nhân", () => {
    const ev = evalR2Cors([], "https://fwbvietnam.pages.dev", "PUT", R2_UPLOAD_HEADERS);
    expect(ev.covered).toBe(false);
    expect(ev.reasons[0]).toMatch(/chưa có cấu hình CORS/);
  });

  it("thiếu AllowedHeaders content-type → không phủ dù origin/method đúng", () => {
    const rule: R2CorsRule = {
      AllowedOrigins: ["https://fwbvietnam.pages.dev"],
      AllowedMethods: ["PUT"],
    };
    const ev = evalR2Cors([rule], "https://fwbvietnam.pages.dev", "PUT", R2_UPLOAD_HEADERS);
    expect(ev.covered).toBe(false);
    expect(ev.reasons.some((r) => r.includes("content-type"))).toBe(true);
  });

  it("thiếu method PUT → không phủ dù origin đúng", () => {
    const rule: R2CorsRule = {
      AllowedOrigins: ["https://fwbvietnam.pages.dev"],
      AllowedMethods: ["GET"],
      AllowedHeaders: ["content-type", "cache-control"],
    };
    const ev = evalR2Cors([rule], "https://fwbvietnam.pages.dev", "PUT", R2_UPLOAD_HEADERS);
    expect(ev.covered).toBe(false);
    expect(ev.reasons.some((r) => r.includes("Method PUT"))).toBe(true);
  });

  it("wildcard '*' và 'x-amz-*' được hiểu đúng", () => {
    const rule: R2CorsRule = {
      AllowedOrigins: ["*"],
      AllowedMethods: ["*"],
      AllowedHeaders: ["x-amz-*", "content-type"],
    };
    expect(ruleCovers(rule, "https://bat-ky.vercel.app", "PUT", ["content-type"])).toBe(true);
    expect(ruleCovers(rule, "https://bat-ky.vercel.app", "PUT", ["x-amz-meta-a"])).toBe(true);
    expect(ruleCovers(rule, "https://bat-ky.vercel.app", "PUT", ["secret-header"])).toBe(false);
  });

  it("danh sách origin mặc định đủ 2 nền tảng deploy chính thức", () => {
    expect(R2_DEFAULT_CORS_ORIGINS).toContain("https://fwbvietnam.pages.dev");
    expect(R2_DEFAULT_CORS_ORIGINS).toContain("https://fwbvietnam.vercel.app");
  });
});
