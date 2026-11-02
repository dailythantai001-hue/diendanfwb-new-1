import { describe, expect, it } from "vitest";
import { NEARBY_PAGE_SIZE, nearbyColumns } from "./nearby-query";

describe("nearby query", () => {
  it("loads between 10 and 20 members per page", () => {
    expect(NEARBY_PAGE_SIZE).toBeGreaterThanOrEqual(10);
    expect(NEARBY_PAGE_SIZE).toBeLessThanOrEqual(20);
  });
  it("never selects the full profile", () => {
    expect(nearbyColumns({ bodies: [] })).not.toContain("*");
    expect(nearbyColumns({ bodies: [] })).not.toContain("height");
  });
});
