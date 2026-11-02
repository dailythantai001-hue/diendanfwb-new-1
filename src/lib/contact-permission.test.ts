import { describe, it, expect } from "vitest";
import { canOpenContact } from "./contact-permission";
describe("contact entitlement preserved", () => {
  it("denies level 1 and allows level 2", () => {
    const owner={id:"owner"};
    expect(canOpenContact({id:"viewer",vip_level:1},owner)).toBe(false);
    expect(canOpenContact({id:"viewer",vip_level:2},owner)).toBe(true);
  });
  it("retains owner and Admin access", () => {
    expect(canOpenContact({id:"owner"},{id:"owner"})).toBe(true);
    expect(canOpenContact({is_admin:true},{id:"owner"})).toBe(true);
    expect(canOpenContact(null,{is_admin:true})).toBe(true);
  });
});