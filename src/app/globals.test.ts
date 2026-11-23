import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(
  resolve(__dirname, "globals.css"),
  "utf8",
);

const RTL_LOCALES = ["ar", "he"] as const;

describe("RTL layout support in globals.css", () => {
  it("declares RTL direction rules for Arabic", () => {
    expect(globalsCss).toMatch(/\[dir=["']?rtl["']?\]/);
    expect(globalsCss).toMatch(/\[lang\|=["']?ar["']?\]/);
  });

  it("declares RTL direction rules for Hebrew", () => {
    expect(globalsCss).toMatch(/\[lang\|=["']?he["']?\]/);
  });

  it("sets text direction to rtl for RTL locales", () => {
    expect(globalsCss).toMatch(/direction:\s*rtl/);
  });

  it("mirrors UI controls using logical properties", () => {
    expect(globalsCss).toMatch(/margin-inline-(start|end)/);
    expect(globalsCss).toMatch(/padding-inline-(start|end)/);
    expect(globalsCss).toMatch(/inset-inline-(start|end)/);
  });

  it("mirrors directional icons for RTL locales", () => {
    expect(globalsCss).toMatch(/scaleX\(-1\)/);
  });

  it.each(RTL_LOCALES)("provides a %s locale hook for layout tests", (locale) => {
    expect(globalsCss).toContain(`[lang|="${locale}"]`);
  });
});
