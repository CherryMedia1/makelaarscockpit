import { describe, expect, it } from "vitest";
import { syncAanvraag } from "./sync";

const NU = new Date("2026-11-23T12:00:00Z");
const minutenGeleden = (m: number) => new Date(NU.getTime() - m * 60_000);

describe("syncAanvraag", () => {
  it("mag als er nog nooit is gesynchroniseerd", () => {
    expect(syncAanvraag(null, NU)).toEqual({ mag: true });
  });

  it("mag niet zolang een eerdere aanvraag in de wachtrij staat of bezig is", () => {
    expect(syncAanvraag({ status: "wachtrij", aangevraagdOp: minutenGeleden(1) }, NU)).toEqual({ mag: false, reden: "loopt" });
    expect(syncAanvraag({ status: "bezig", aangevraagdOp: minutenGeleden(20) }, NU)).toEqual({ mag: false, reden: "loopt" });
  });

  it("beschouwt een aanvraag die na een half uur nog niet klaar is als verlopen", () => {
    expect(syncAanvraag({ status: "bezig", aangevraagdOp: minutenGeleden(31) }, NU)).toEqual({ mag: true });
    expect(syncAanvraag({ status: "wachtrij", aangevraagdOp: minutenGeleden(45) }, NU)).toEqual({ mag: true });
  });

  it("mag hooguit één keer per kwartier na een geslaagde run", () => {
    expect(syncAanvraag({ status: "klaar", aangevraagdOp: minutenGeleden(14) }, NU)).toEqual({ mag: false, reden: "te_snel", weerOm: new Date("2026-11-23T12:01:00Z") });
    expect(syncAanvraag({ status: "klaar", aangevraagdOp: minutenGeleden(15) }, NU)).toEqual({ mag: true });
  });

  it("mag direct opnieuw na een mislukte run", () => {
    expect(syncAanvraag({ status: "mislukt", aangevraagdOp: minutenGeleden(1) }, NU)).toEqual({ mag: true });
  });
});
