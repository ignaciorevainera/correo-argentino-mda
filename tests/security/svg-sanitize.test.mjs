import { sanitizeSvgContent } from '../../src/lib/svgSanitize.ts';
import assert from "node:assert/strict";

const SVG_BASIC = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>`;
const SVG_SCRIPT = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect/></svg>`;
const SVG_SCRIPT_WITH_ATTR = `<svg xmlns="http://www.w3.org/2000/svg"><script type="text/javascript">alert(1)</script><rect/></svg>`;
const SVG_FOREIGN = `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe src="evil.com"></iframe></foreignObject><rect/></svg>`;
const SVG_ONLOAD = `<svg xmlns="http://www.w3.org/2000/svg"><rect onload="alert(1)" width="100" height="100"/></svg>`;
const SVG_ONCLICK = `<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="alert(1)" width="100"/></svg>`;
const SVG_HREF_JS = `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)">click</a></svg>`;
const SVG_XLINK_JS = `<svg xmlns="http://www.w3.org/2000/svg"><a xlink:href="javascript:alert(1)">click</a></svg>`;
const SVG_MULTI = `<svg xmlns="http://www.w3.org/2000/svg"><script>evil()</script><rect onload="evil()" onerror="evil()" width="100"/><foreignObject><div>html</div></foreignObject></svg>`;

// 1. SVG limpio no se altera
const clean1 = sanitizeSvgContent(SVG_BASIC);
assert.equal(clean1, SVG_BASIC, "SVG limpio debe retornarse igual");

// 2. <script> eliminado
const clean2 = sanitizeSvgContent(SVG_SCRIPT);
assert.ok(!clean2.includes("alert(1)"), "script tag debe eliminarse");
assert.equal(clean2, `<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`);

// 3. <script> con atributo eliminado
const clean3 = sanitizeSvgContent(SVG_SCRIPT_WITH_ATTR);
assert.ok(!clean3.includes("alert(1)"), "script tag con atributo debe eliminarse");

// 4. <foreignObject> eliminado
const clean4 = sanitizeSvgContent(SVG_FOREIGN);
assert.ok(!clean4.includes("foreignObject"), "foreignObject debe eliminarse");
assert.ok(!clean4.includes("evil.com"), "contenido de foreignObject debe eliminarse");

// 5. onload eliminado
const clean5 = sanitizeSvgContent(SVG_ONLOAD);
assert.ok(!clean5.includes("onload"), "onload handler debe eliminarse");
assert.ok(!clean5.includes("alert(1)"), "cuerpo de handler debe eliminarse");

// 6. onclick eliminado
const clean6 = sanitizeSvgContent(SVG_ONCLICK);
assert.ok(!clean6.includes("onclick"), "onclick handler debe eliminarse");

// 7. href="javascript:" reemplazado
const clean7 = sanitizeSvgContent(SVG_HREF_JS);
assert.ok(!clean7.includes("javascript:alert"), "href javascript debe eliminarse");
assert.ok(clean7.includes('href="#"'), "href debe reemplazarse por #");

// 8. xlink:href="javascript:" reemplazado
const clean8 = sanitizeSvgContent(SVG_XLINK_JS);
assert.ok(!clean8.includes("javascript:alert"), "xlink:href javascript debe eliminarse");
assert.ok(clean8.includes('href="#"'), "xlink:href debe reemplazarse por #");

// 9. Múltiples vectores juntos
const clean9 = sanitizeSvgContent(SVG_MULTI);
assert.ok(!clean9.includes("evil"), "todos los vectores eliminados");
assert.ok(!clean9.includes("script"), "script eliminado en multi");
assert.ok(!clean9.includes("onload"), "onload eliminado en multi");
assert.ok(!clean9.includes("foreignObject"), "foreignObject eliminado en multi");

console.log("All SVG sanitize tests passed!");
