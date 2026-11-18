import { describe, expect, it } from "vitest";
process.env.DATABASE_URL ??= "postgresql://x";
const { newRefToken, hashToken, tokenMatches, encryptToken, decryptToken } = await import("./tokens");

describe("ref tokens", () => {
  it("are 32 random chars, stored hashed, and verifiable", () => {
    const t = newRefToken();
    expect(t).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(newRefToken()).not.toBe(t);
    const h = hashToken(t);
    expect(h).not.toContain(t);
    expect(tokenMatches(t, h)).toBe(true);
    expect(tokenMatches(t + "x", h)).toBe(false);
    expect(tokenMatches(t, null)).toBe(false);
  });
  it("round-trips the encrypted copy used for re-displaying the link", () => {
    const t = newRefToken();
    expect(decryptToken(encryptToken(t))).toBe(t);
    expect(decryptToken("garbage")).toBeNull();
  });
});
