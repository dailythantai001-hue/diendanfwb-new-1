import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, isScanConfigComplete, normalizeFilters, simulatedDistanceKm, type ScanFilters } from "./nearby-scan";
import { cardsFromRecent, isCardVisible, revealCard } from "./nearby-scan-session";

const full: ScanFilters = { genders: [], ageMin: 20, ageMax: 35, needs: ["ons"], distMin: 11, distMax: 200, bodies: ["slim"], districts: [] };

describe("required scan config", () => {
  it("never saved => not allowed", () => expect(isScanConfigComplete(null)).toBe(false));
  it("defaults (no Nhu cầu / Vóc dáng) => not allowed", () => expect(isScanConfigComplete(DEFAULT_FILTERS)).toBe(false));
  it("missing Nhu cầu => not allowed", () => expect(isScanConfigComplete({ ...full, needs: [] })).toBe(false));
  it("missing Vóc dáng => not allowed", () => expect(isScanConfigComplete({ ...full, bodies: [] })).toBe(false));
  it("locked distance (≤ 10 km) => not allowed", () => expect(isScanConfigComplete({ ...full, distMin: 5 })).toBe(false));
  it("distance above 200 km => not allowed", () => expect(isScanConfigComplete({ ...full, distMax: 250 })).toBe(false));
  it("broken age range => not allowed", () => expect(isScanConfigComplete({ ...full, ageMin: 36, ageMax: 30 })).toBe(false));
  it("all criteria saved => allowed", () => expect(isScanConfigComplete(full)).toBe(true));
  it("a saved row with junk values normalizes to not allowed", () => expect(isScanConfigComplete(normalizeFilters({ needs: "x", bodies: null }))).toBe(false));
});

describe("simulated distance (10–200 km, inside the user's range, stable)", () => {
  const ids = Array.from({ length: 300 }, (_, i) => `cand-${i}`);
  const within = (lo: number, hi: number, f: { distMin: number; distMax: number }) =>
    ids.every(id => { const d = simulatedDistanceKm("user-a", id, f); return d >= lo && d <= hi; });
  it("10–50 km stays in 10–50", () => expect(within(10, 50, { distMin: 10, distMax: 50 })).toBe(true));
  it("50–100 km stays in 50–100", () => expect(within(50, 100, { distMin: 50, distMax: 100 })).toBe(true));
  it("100–200 km stays in 100–200", () => expect(within(100, 200, { distMin: 100, distMax: 200 })).toBe(true));
  it("out-of-range limits are clamped to 10–200", () => expect(within(10, 200, { distMin: 1, distMax: 1268 })).toBe(true));
  it("same user + candidate always gets the same km", () =>
    expect(simulatedDistanceKm("user-a", "cand-1", full)).toBe(simulatedDistanceKm("user-a", "cand-1", full)));
});

describe("restoring results", () => {
  const now = 1_800_000_000_000;
  const person = { id: "p1", full_name: "A", avatar: null, age: 22, gender: "female", province: null, intent: "fwb" };
  const ok = (_p: unknown, key: string, scannedAt = now) => ({ key, status: "success" as const, row: { id: "p1", name: "A", avatar: null, age: 22, gender: "female", need: null, province: null }, score: 60, scannedAt });
  it("restores today's hits; expired misses are dropped; a recent miss keeps only its remaining time", () => {
    const cards = cardsFromRecent([
      { candidate_id: "p1", hit: true, scanned_at: new Date(now - 3600_000).toISOString(), person },
      { candidate_id: "p2", hit: false, scanned_at: new Date(now - 60_000).toISOString(), person: null },
      { candidate_id: "p3", hit: false, scanned_at: new Date(now - 11_000).toISOString(), person: null },
    ], now, now, ok);
    expect(cards.map(c => c.status)).toEqual(["success", "fail"]);
    const miss = cards[1]!;
    expect(miss.status === "fail" && miss.shownAt).toBe(now - 1000);
    expect(isCardVisible(miss, now + 1999)).toBe(true);
    expect(isCardVisible(miss, now + 2000)).toBe(false);
  });
  it("a scan restored mid-animation stays 'scanning' with its server result", () => {
    const [c] = cardsFromRecent([{ candidate_id: "p1", hit: true, scanned_at: new Date(now - 4000).toISOString(), person }], now, now, ok);
    expect(c?.status).toBe("scanning");
    expect(revealCard(c!).status).toBe("success");
  });
});
