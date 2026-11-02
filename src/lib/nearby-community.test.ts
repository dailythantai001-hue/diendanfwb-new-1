import { describe, expect, it } from "vitest";
import { CommunityPager, SCAN_ANIMATION_MS, femaleSecondAccountQuery, hitDisplayScore, randomHitScore, isRealScanUser, scanProgress, validateScanSettings } from "./nearby-community";
describe("community scan pagination", () => {
  it("continues after short pages until an actually empty page", async () => {
    const cursors: (string | null)[] = [];
    const pager = new CommunityPager(async cursor => { cursors.push(cursor); return cursor === null ? [{ id: "1" }] : cursor === "1" ? [{ id: "2" }] : []; });
    expect((await pager.next())?.id).toBe("1");
    expect((await pager.next())?.id).toBe("2");
    expect(await pager.next()).toBeNull();
    expect(cursors).toEqual([null, "1", "2"]);
  });
  it("retries errors without falsely exhausting or advancing", async () => {
    let failed = false;
    const pager = new CommunityPager(async () => { if (!failed) { failed = true; throw new Error("network"); } return [{ id: "1" }]; });
    await expect(pager.next()).rejects.toThrow("network");
    expect((await pager.next())?.id).toBe("1");
  });
  it("does not stop at the old 100-page guard", async () => {
    const pager = new CommunityPager(async c => Number(c || 0) < 105 ? [{ id: String(Number(c || 0) + 1) }] : []);
    for (let n = 1; n <= 105; n++) expect((await pager.next())?.id).toBe(String(n));
    expect(await pager.next()).toBeNull();
  });
});
it("excludes second accounts and virtual/seed accounts from real-user tracking", () => {
  expect(isRealScanUser({ account_source: "internal" })).toBe(false);
  expect(isRealScanUser({ is_virtual: true })).toBe(false);
  expect(isRealScanUser({ is_seed_account: true })).toBe(false);
  expect(isRealScanUser({ account_source: null })).toBe(true);
});
it("accepts zero and 100 percent hit rates", () => {
  expect(validateScanSettings({ delay_seconds: 2, hit_percent: 0 }).hit_percent).toBe(0);
  expect(validateScanSettings({ delay_seconds: 2, hit_percent: 100 }).hit_percent).toBe(100);
  expect(() => validateScanSettings({ delay_seconds: 2, hit_percent: 101 })).toThrow();
});it("scan pool reads only female second accounts from Supabase #1 profiles", () => {
  const q = new URLSearchParams(femaleSecondAccountQuery(null));
  expect(q.get("account_source")).toBe("eq.internal");
  expect(q.get("gender")).toBe("eq.female");
  expect(q.get("select")).not.toMatch(/photos|vip_media|email|phone|password/);
  expect(new URLSearchParams(femaleSecondAccountQuery("abc")).get("id")).toBe("gt.abc");
});
describe("scan pool: each account offered at most once", () => {
  const ids = ["a", "b", "c"];
  const page = async (c: string | null) => ids.filter(i => c === null || i > c).slice(0, 2).map(id => ({ id }));
  it("from a random start, covers the rest of the list once then reports exhaustion (no repeats)", async () => {
    const pager = new CommunityPager(page, { wrap: true, start: "b" });
    const got: (string | undefined)[] = [];
    for (let n = 0; n < 5; n++) got.push((await pager.next())?.id);
    expect(got).toEqual(["c", "a", "b", undefined, undefined]);
  });
  it("skips accounts the server filtered out as already scanned, without stopping early", async () => {
    // Server returns filtered items but the raw cursor, so a fully-seen page is not "the end".
    const pager = new CommunityPager(async (c: string | null) =>
      c === null ? { items: [], last: "b" } : c === "b" ? { items: [{ id: "c" }], last: "c" } : { items: [], last: null });
    expect((await pager.next())?.id).toBe("c");
    expect(await pager.next()).toBeNull();
  });
  it("reports empty only when the pool has no female second accounts", async () => {
    const pager = new CommunityPager(async () => [] as { id: string }[], { wrap: true, start: "x" });
    expect(await pager.next()).toBeNull();
  });
});
it("scan progress is linear over exactly 10 seconds and never jumps", () => {
  expect(SCAN_ANIMATION_MS).toBe(10_000);
  expect(scanProgress(4_000, true)).toBe(40);
  expect(scanProgress(6_400, true)).toBe(64);
  expect(scanProgress(9_999, true)).toBeLessThan(100);
  expect(scanProgress(10_000, true)).toBe(100);
});
it("scan progress holds at 99% until the server result is ready", () => {
  expect(scanProgress(15_000, false)).toBe(99);
});
it("a server hit is always displayed above the 50% threshold", () => {
  expect(hitDisplayScore(20)).toBe(51);
  expect(hitDisplayScore(80)).toBe(80);
});
it("page query returns ids only; single-candidate query is still female + internal", () => {
  expect(new URLSearchParams(femaleSecondAccountQuery(null)).get("select")).toBe("id");
  const one = new URLSearchParams(femaleSecondAccountQuery(null, "u1"));
  expect(one.get("id")).toBe("eq.u1");
  expect(one.get("account_source")).toBe("eq.internal");
  expect(one.get("gender")).toBe("eq.female");
});

describe("random hit score", () => {
  it("lowest random is 51", () => expect(randomHitScore(() => 0)).toBe(51));
  it("highest random is 100", () => expect(randomHitScore(() => 0.9999999)).toBe(100));
  it("covers every value 51–100", () => {
    const seen = new Set(Array.from({ length: 50 }, (_, i) => randomHitScore(() => (i + 0.5) / 50)));
    expect(seen.size).toBe(50);
  });
});
