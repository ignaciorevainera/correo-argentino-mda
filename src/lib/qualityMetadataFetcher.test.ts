import test from "node:test";
import assert from "node:assert/strict";
import {
  stripQuotedEmailText,
  emailThreadFromActivities,
} from "./qualityMetadataFetcher";

test("stripQuotedEmailText remueve citas con prefijo > y delimitadores comunes", () => {
  const emailBody = `Estimado usuario,\nLe informamos que su gestión fue realizada.\n\n> El 15/10/2026 cliente escribió:\n> Necesito ayuda con mi clave.\n-----Mensaje original-----\nDe: cliente@correo.com\nAsunto: Consulta`;
  const stripped = stripQuotedEmailText(emailBody);
  assert.equal(
    stripped,
    "Estimado usuario,\nLe informamos que su gestión fue realizada.",
  );
});

test("emailThreadFromActivities devuelve undefined ante actividades vacías o sin mensajes válidos", () => {
  assert.equal(emailThreadFromActivities([]), undefined);
  assert.equal(emailThreadFromActivities([{ type: "system", content: "status change" }]), undefined);
  assert.equal(emailThreadFromActivities([{ type: "contact_message", content: "" }]), undefined);
});

test("emailThreadFromActivities extrae, limpia HTML y ordena cronológicamente mensajes de cliente y operador", () => {
  const activities = [
    {
      id: 200,
      type: "user_reply",
      created_at: "2026-10-17 10:15:00",
      content: "<p>Hola Juan, le informamos que <strong>su paquete</strong> ya se encuentra en camino.</p>",
    },
    {
      id: 100,
      type: "contact_message",
      created_at: "2026-10-17 10:00:00",
      content: "<div>Buenos días,<br>Quisiera consultar el estado de mi envío &amp; número de guía.</div>",
    },
  ];

  const thread = emailThreadFromActivities(activities);
  assert.ok(thread);
  assert.equal(thread.messages.length, 2);
  assert.equal(thread.hasCustomerMessage, true);
  assert.equal(thread.hasOperatorReply, true);

  // Mensaje 1: cliente (más antiguo)
  assert.equal(thread.messages[0].type, "customer");
  assert.equal(thread.messages[0].createdAt, "2026-10-17 10:00:00");
  assert.ok(thread.messages[0].content.includes("Quisiera consultar el estado de mi envío & número de guía."));

  // Mensaje 2: operador
  assert.equal(thread.messages[1].type, "operator");
  assert.equal(thread.messages[1].createdAt, "2026-10-17 10:15:00");
  assert.ok(thread.messages[1].content.includes("Hola Juan, le informamos que su paquete ya se encuentra en camino."));
});

test("emailThreadFromActivities trunca contenidos que superen 2500 caracteres por mensaje", () => {
  const longText = "A".repeat(3000);
  const activities = [
    {
      id: 10,
      type: "contact_message",
      created_at: "2026-10-17 09:00:00",
      content: longText,
    },
  ];

  const thread = emailThreadFromActivities(activities);
  assert.ok(thread);
  assert.equal(thread.messages.length, 1);
  assert.equal(thread.messages[0].content.length, 2500);
  assert.equal(thread.hasCustomerMessage, true);
  assert.equal(thread.hasOperatorReply, false);
});

test("parseWiseCallMetadata prioriza la duración de la grabación de audio sobre la duración bruta de call_data", async () => {
  const { parseWiseCallMetadata } = await import("./qualityMetadataFetcher");
  const caseData = { id: "547163", number: "547163", created_at: "2026-10-20 14:00:00" };
  const activities = [
    {
      call_data: { duration: 385 }, // 06:25 tiempo total de sesión
      recordings: [{ url: "https://s3.amazonaws.com/rec/audio.mp3", duration: 340 }], // 05:40 llamada neta
    },
  ];
  const meta = parseWiseCallMetadata(caseData, activities);
  assert.equal(meta.duration, "05:40");
});
