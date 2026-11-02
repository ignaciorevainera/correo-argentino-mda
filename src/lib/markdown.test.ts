import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "./markdown.js";

test("renderMarkdown - sanitización estricta anti-XSS", async (t) => {
  await t.test("elimina etiquetas <script> y su contenido peligroso", () => {
    const input = "Texto normal <script>alert('xss')</script> continuación";
    const result = renderMarkdown(input);
    assert.doesNotMatch(result, /<script>/i);
    assert.doesNotMatch(result, /alert/i);
    assert.match(result, /Texto normal/);
  });

  await t.test("despoja manejadores de eventos en línea (onerror, onload, onclick)", () => {
    const input = `<img src="x" onerror="alert(1)"> <a href="#" onclick="evil()">Click</a>`;
    const result = renderMarkdown(input);
    assert.doesNotMatch(result, /onerror/i);
    assert.doesNotMatch(result, /onclick/i);
    assert.doesNotMatch(result, /evil/i);
  });

  await t.test("bloquea esquemas inseguros javascript: y data: en enlaces", () => {
    const input = `[Peligro](javascript:alert(1)) y [Data](data:text/html,<script>alert(1)</script>)`;
    const result = renderMarkdown(input);
    assert.doesNotMatch(result, /javascript:/i);
    assert.doesNotMatch(result, /data:text\/html/i);
  });

  await t.test("elimina etiquetas iframe, object, embed", () => {
    const input = `<iframe src="https://evil.com"></iframe><embed src="evil.swf">`;
    const result = renderMarkdown(input);
    assert.doesNotMatch(result, /<iframe/i);
    assert.doesNotMatch(result, /<embed/i);
  });

  await t.test("rechaza o despoja el atributo class para prevenir UI-redressing", () => {
    const input = `<div class="fixed inset-0 z-[9999] bg-red-500">Overlay</div> <p class="hidden">Oculto</p>`;
    const result = renderMarkdown(input);
    assert.doesNotMatch(result, /class=/i);
    assert.doesNotMatch(result, /fixed inset-0/i);
  });

  await t.test("degrada imágenes no autorizadas preservando de forma segura su texto alternativo", () => {
    const input = `![Logo de prueba](https://externo.com/foto.png)`;
    const result = renderMarkdown(input);
    assert.doesNotMatch(result, /<img/i);
    assert.match(result, /Logo de prueba/);
  });
});
