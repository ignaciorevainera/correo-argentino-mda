import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const fileUrl = (path) => new URL(path, root);
const read = (path) => readFile(fileUrl(path), "utf8");
const exists = (path) => existsSync(fileUrl(path));

// 1. Check login page is NOT prerendered (needs SSR for form submission)
console.log("Checking login.astro SSR configuration...");
const loginPage = await read("src/pages/login/index.astro");
assert.doesNotMatch(loginPage, /export\s+const\s+prerender\s*=\s*true/, "login/index.astro MUST NOT be prerendered since it handles POST requests");

// 2. Check LinkItem.astro uses lazy loading and async decoding for img or Image tags
console.log("Checking LinkItem.astro image optimization...");
const linkItem = await read("src/pages/recursos/_components/LinkItem.astro");
assert.match(linkItem, /<(?:img|Image)[^>]*loading=["']lazy["']/, "LinkItem.astro image should have loading='lazy'");
assert.match(linkItem, /<(?:img|Image)[^>]*decoding=["']async["']/, "LinkItem.astro image should have decoding='async'");

// 3. Check CatalogAppCard.astro uses lazy loading and async decoding for img tags
console.log("Checking CatalogAppCard.astro image optimization...");
const catalogAppCard = await read("src/pages/recursos/aplicativos/_components/CatalogAppCard.astro");
assert.match(catalogAppCard, /<img[^>]*loading=["']lazy["']/, "CatalogAppCard.astro img should have loading='lazy'");
assert.match(catalogAppCard, /<img[^>]*decoding=["']async["']/, "CatalogAppCard.astro img should have decoding='async'");

// 4. Check EstadisticasContent.astro defer on chart.js CDN script
console.log("Checking EstadisticasContent.astro chart.js script defer...");
const estadisticasContent = await read("src/components/supervision/asistencia/EstadisticasContent.astro");
assert.match(estadisticasContent, /<script[^>]*src=["']https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js["'][^>]*defer/, "chart.js script tag should have defer attribute");

// 5. Check titulos/index.astro client:idle hydration directive
console.log("Checking titulos/index.astro TitlesContainer client:idle directive...");
const titulosIndex = await read("src/pages/titulos/index.astro");
assert.match(titulosIndex, /<TitlesContainer[^>]*client:idle/, "TitlesContainer in titulos/index.astro should use client:idle");

console.log("All performance optimizations verified successfully!");
