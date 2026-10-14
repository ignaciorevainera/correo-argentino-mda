import { describe, expect, it } from "vitest";
import { evaluateOrthography } from "@lib/orthography";

const kinds = (text: string) => evaluateOrthography(text).findings.map((f) => f.kind);
const words = (text: string) => evaluateOrthography(text).findings.map((f) => f.word);

describe("evaluateOrthography", () => {
  it("no observa nada sin texto", () => {
    expect(evaluateOrthography("")).toEqual({ complies: true, findings: [] });
    expect(evaluateOrthography("   \n ")).toEqual({ complies: true, findings: [] });
  });

  it("cumple con un texto limpio", () => {
    const text = "Cliente no tiene acceso a la VPN de la sucursal O5597.";
    expect(evaluateOrthography(text).complies).toBe(true);
  });

  it("detecta erratas frecuentes", () => {
    expect(kinds("nesecita reinstalar")).toContain("typo");
    expect(words("nesecita reinstalar")).toContain("nesecita");
  });

  it("no penaliza la errata ya escrita bien", () => {
    expect(evaluateOrthography("También se debe enviar mail").findings).toHaveLength(0);
  });

  it("detecta palabras del catálogo sin tilde", () => {
    expect(kinds("Revisar la configuracion del equipo")).toContain("missing-accent");
    expect(words("Revisar la configuracion del equipo")).toContain("configuracion");
  });

  it("no penaliza la palabra ya escrita con tilde", () => {
    expect(evaluateOrthography("Revisar la configuración del equipo").findings).toHaveLength(0);
  });

  it("no penaliza siglas, marcas ni códigos", () => {
    const text =
      "Invgate / Wise CX / SDW / Fortinet / Zebra / Cubic / N5597 / VPN O5597 / DNS";
    expect(evaluateOrthography(text).complies).toBe(true);
  });

  it("detecta puntuación pegada a la palabra siguiente", () => {
    expect(kinds("Se realizo el cambio,verificar")).toContain("spacing");
  });

  it("detecta caracteres repetidos", () => {
    expect(kinds("pruebaaaa de tipeo")).toContain("repetition");
  });

  it("detecta oración que arranca en minúscula", () => {
    expect(kinds("todo ok. el cliente espera respuesta")).toContain("capitalization");
  });

  it("no se dispara por mayúsculas de inicio de oración", () => {
    expect(kinds("Se realizo la prueba. El equipo responde.")).not.toContain(
      "capitalization",
    );
  });

  it("respeta la whitelist adicional", () => {
    expect(evaluateOrthography("El cliente tambien espera").findings).toHaveLength(1);
    expect(
      evaluateOrthography("El cliente tambien espera", { extraWhitelist: ["tambien"] })
        .findings,
    ).toHaveLength(0);
  });
});