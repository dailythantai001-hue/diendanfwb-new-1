import { describe, expect, it } from "vitest";
import { postImageUrls, reviewImageKey } from "./pending-review-r2.server";
const domain = "https://pub-existing.r2.dev", endpoint = "https://account.r2.cloudflarestorage.com";
describe("rejected post image safety", () => {
  it("deduplicates both legacy and current image references", () => {
    expect(postImageUrls({ image_urls: ["a", "b", "a"], image_url: "b" })).toEqual(["a", "b"]);
  });
  it("resolves only the existing bucket and domain", () => {
    expect(reviewImageKey(`${domain}/posts/photo.jpg`, domain, endpoint, "old-bucket")).toBe("posts/photo.jpg");
    expect(reviewImageKey(`${endpoint}/old-bucket/posts/photo.jpg`, domain, endpoint, "old-bucket")).toBe("posts/photo.jpg");
    expect(reviewImageKey("https://other.r2.dev/posts/photo.jpg", domain, endpoint, "old-bucket")).toBeNull();
    expect(reviewImageKey(`${endpoint}/another-bucket/photo.jpg`, domain, endpoint, "old-bucket")).toBeNull();
    expect(reviewImageKey("posts/photo.jpg", domain, endpoint, "old-bucket")).toBeNull();
  });
  it("rejects traversal and malformed tokens", () => {
    expect(reviewImageKey(`${domain}/posts/%2E%2E%2Fphoto.jpg`, domain, endpoint, "old-bucket")).toBeNull();
    expect(reviewImageKey(`${domain}/posts/%ZZ.jpg`, domain, endpoint, "old-bucket")).toBeNull();
  });
});