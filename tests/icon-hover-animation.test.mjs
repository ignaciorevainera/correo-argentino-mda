import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const drawer = await read("src/layouts/_components/drawerContent.astro");
const navbar = await read("src/layouts/_components/navbar.astro");

// Sidebar: nav item icon scales on hover
assert.match(
  drawer,
  /group-hover:scale-110 group-hover:opacity-100/,
  "sidebar nav icon: scale + opacity on group hover",
);

// Sidebar: logo anchor is a group, picture scales on hover
assert.match(
  drawer,
  /class="group border-secondary-content\/10 flex min-h-20/,
  "sidebar logo: anchor marked as group",
);
assert.match(
  drawer,
  /transition-transform duration-200 ease-out group-hover:scale-110/,
  "sidebar logo: picture scales on hover",
);

// Header: help icon scales on hover
assert.match(
  navbar,
  /name="boxicons:help-circle-filled"[^>]*group-hover:scale-110/,
  "header help: icon scales on hover",
);

// Header: theme changer label is a group, icons scale via transform
assert.match(
  navbar,
  /swap swap-rotate group"/,
  "header theme: label marked as group",
);
assert.match(
  navbar,
  /group-hover:\[transform:scale\(1\.1\)\]/,
  "header theme: icons scale on hover",
);

console.log("icon-hover-animation: all checks passed");
