import { describe, expect, it } from "vitest";
import { platformVanUrl, valideerLeadLinks } from "./contact";

describe("platformVanUrl", () => {
  it("herkent LinkedIn, Facebook en Instagram aan het domein, ook met www of een subdomein", () => {
    expect(platformVanUrl("https://www.linkedin.com/in/voorbeeld")).toBe("linkedin");
    expect(platformVanUrl("https://nl.linkedin.com/in/voorbeeld")).toBe("linkedin");
    expect(platformVanUrl("https://facebook.com/voorbeeld")).toBe("facebook");
    expect(platformVanUrl("https://m.facebook.com/voorbeeld")).toBe("facebook");
    expect(platformVanUrl("https://www.instagram.com/voorbeeld/")).toBe("instagram");
  });

  it("herkent geen andere sites, geen lookalikes en geen onveilige of ongeldige adressen", () => {
    expect(platformVanUrl("https://voorbeeld.test/linkedin.com")).toBeNull();
    expect(platformVanUrl("https://linkedin.com.voorbeeld.test/in/x")).toBeNull();
    expect(platformVanUrl("https://nietlinkedin.com/in/x")).toBeNull();
    expect(platformVanUrl("http://www.linkedin.com/in/x")).toBeNull();
    expect(platformVanUrl("javascript:alert(1)")).toBeNull();
    expect(platformVanUrl("geen url")).toBeNull();
  });
});

describe("valideerLeadLinks", () => {
  it("accepteert lege velden en geldige links, en haalt spaties weg", () => {
    expect(valideerLeadLinks({ linkedin: " https://www.linkedin.com/in/voorbeeld ", facebook: "", instagram: "https://instagram.com/voorbeeld" })).toEqual({
      ok: true, waarde: { linkedin: "https://www.linkedin.com/in/voorbeeld", facebook: null, instagram: "https://instagram.com/voorbeeld" },
    });
  });

  it("weigert een link die niet bij het platform hoort, en zegt welk veld", () => {
    expect(valideerLeadLinks({ linkedin: "https://facebook.com/voorbeeld", facebook: "", instagram: "" })).toEqual({ ok: false, fout: "linkedin" });
    expect(valideerLeadLinks({ linkedin: "", facebook: "", instagram: "instagram.com/voorbeeld" })).toEqual({ ok: false, fout: "instagram" });
  });

  it("weigert een buitensporig lange link", () => {
    expect(valideerLeadLinks({ linkedin: `https://www.linkedin.com/in/${"x".repeat(300)}`, facebook: "", instagram: "" })).toEqual({ ok: false, fout: "linkedin" });
  });
});
