/**
 * Número de operador de la mesa (01, 02, ... 27) por username de agente.
 *
 * No hay columna para esto en el esquema (ver `src/db/schema.ts`), así que es
 * una lista fija. Se indexa por USERNAME y no por nombre completo porque en
 * `agents.name` el apellido viene primero y hay discrepancias con el listado
 * oficial (ej. "Paredes Joel" vs "Yoel Paredes", "Llamas Carolina" vs "Juana
 * Llamas"). Los operadores sin numero quedan al final de la grilla.
 *
 * shortcut: lista hardcodeada de 21 operadores; cuando InvGate exponga el
 * numero de operador, reemplazar por columna + sync.
 */
const OPERATOR_NUMBERS: Record<string, number> = {
  brugutierrez: 1,
  johmartinez: 2,
  darodriguez: 3,
  tacardenas: 4,
  ayoparedes: 5,
  juescudero: 6,
  jcllamas: 7,
  fernlopez: 9,
  mallopez: 10,
  asoto: 13,
  nabajko: 14,
  jbazualdo: 15,
  irevainera: 16,
  mchen: 17,
  ramrojas: 19,
  daaltamirano1: 20,
  aguaguirre: 21,
  ccuello: 24,
  carlafernandez: 25,
  frngonzalez: 26,
  fediaz: 27,
};

/** Número de operador, o undefined si no está en la lista. */
export const getOperatorNumber = (username?: string | null): number | undefined =>
  username ? OPERATOR_NUMBERS[username.trim().toLowerCase()] : undefined;