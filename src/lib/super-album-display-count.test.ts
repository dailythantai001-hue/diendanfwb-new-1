import { describe, it, expect } from "vitest";
import { displayCount } from "@/lib/super-albums.server";

describe("ALBUM SIÊU HOT display counts", () => {
  it("uses admin value even when larger than real media", () => expect(displayCount(292, 0)).toBe(292));
  it("allows 0", () => expect(displayCount(0, 5)).toBe(0));
  it("falls back to real count when not set", () => expect(displayCount(null, 3)).toBe(3));
});
