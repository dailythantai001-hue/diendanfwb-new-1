import { expect, it } from "vitest";
import { parseGiftClaim, parseQuota } from "./scan-v2";
import { mergeResultCards, type ScanCard } from "./nearby-scan-session";

const life = { mode: "lifetime", claimed: true, limit: 20, used: 12, remaining: 8, total: 12, hits: 7, misses: 5 };
it("lifetime quota: 12 used leaves exactly 8 of 20", () => {
  expect(parseQuota(life)).toMatchObject({ used: 12, remaining: 8 });
});
it("20 used means 0 remaining (locked forever)", () => {
  expect(parseQuota({ ...life, used: 20, remaining: 0 })).toMatchObject({ remaining: 0 });
});
it("a reply granting more than 20 in total is rejected", () => {
  expect(() => parseQuota({ ...life, used: 12, remaining: 20 })).toThrow("khớp");
  expect(() => parseQuota({ ...life, limit: 30 })).toThrow();
});
it("old daily or weekly replies are never accepted as a quota", () => {
  expect(() => parseQuota({ total: 2, hits: 1, misses: 1 })).toThrow();
  expect(() => parseQuota({ mode: "daily", total: 2, hits: 1, misses: 1, remaining: 28 })).toThrow();
  expect(() => parseQuota({ mode: "weekly", total: 0, hits: 0, misses: 0, used: 0, base_used: 0, remaining: 23, gift_balance: 3 })).toThrow();
});
it("result merging retains every one of 601 accounts and deduplicates repeated pages", () => {
  const rows: ScanCard[] = Array.from({ length: 601 }, (_, n) => ({ key: `r${n}`, status: "success", score: 60, scannedAt: 0,
    row: { id: `p${n}`, name: `P${n}`, avatar: null, age: 20, gender: "female", need: null, province: null } }));
  let cards: ScanCard[] = [];
  for (let n = 0; n < rows.length; n += 100) cards = mergeResultCards(cards, rows.slice(n, n + 100));
  cards = mergeResultCards(cards, rows.slice(0, 100));
  expect(cards).toHaveLength(601);
});

it("unclaimed account has 0 scans until the server records the gift", () => {
  expect(parseQuota({ ...life, claimed: false, used: 0, remaining: 0, total: 0, hits: 0, misses: 0 })).toMatchObject({ remaining: 0 });
  expect(() => parseQuota({ ...life, claimed: false, used: 0, remaining: 20, total: 0, hits: 0, misses: 0 })).toThrow("khớp");
});
it("a new grant must start at 20 remaining; an unconfirmed claim is rejected", () => {
  const g = { ...life, used: 0, remaining: 20, total: 0, hits: 0, misses: 0 };
  expect(parseGiftClaim({ ...g, granted_now: true })).toMatchObject({ grantedNow: true, quota: { remaining: 20 } });
  expect(() => parseGiftClaim({ ...g, claimed: false, remaining: 0, granted_now: true })).toThrow();
  expect(() => parseGiftClaim({ ...life, granted_now: true })).toThrow("khớp");
});
