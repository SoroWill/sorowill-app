import { truncateAddress } from "./freighter";

describe("truncateAddress", () => {
  it("returns short input unmodified (defensive no-op branch)", () => {
    expect(truncateAddress("GABC")).toBe("GABC");
    expect(truncateAddress("123456789012")).toBe("123456789012");
  });

  it("truncates a real 56-character Stellar address", () => {
    const address =
      "GCZST3WHSPDTQK37QWFC3KXZK5OJJ53FUWZPAB5XGTK47ZD5PTJUWQXI";
    expect(address).toHaveLength(56);
    expect(truncateAddress(address)).toBe("GCZS...WQXI");
  });
});
