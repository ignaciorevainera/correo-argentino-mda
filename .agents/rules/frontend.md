---
trigger: always_on
---

Before writing any frontend code, read docs/DESIGN.md from the project. docs/DESIGN.md is the source of truth for the color palette, themes, typography, spacing scale, and visual decisions for this project. Every styling decision must be consistent with what is defined there. If DESIGN.md does not exist, ask before making assumptions about theming or visual direction.

Use semantic HTML. Every element must reflect its meaning in the document structure. Never use a div where a nav, section, article, header, footer, main, aside, or button is appropriate.

Always use .astro components for static or mostly-static content. Reserve framework components (React, Svelte, etc.) for interactive islands only. Client directives: prefer client:visible over client:load unless the component must be interactive before the user scrolls. Use client:load only for components visible immediately on render. Use client:idle for non-critical interactivity. Use client:only for components that must not SSR.

Componentize aggressively. Every repeated structure, every logical unit of UI, and every reusable pattern must be its own component. Components must have one responsibility. Props must always be typed with TypeScript interfaces. Never put business logic inside a UI component — presentation only. Extract logic into src/lib/ and pass results as props.

Always respect the BaseLayout structure. The body must use class="flex flex-col min-h-screen". The main must use class="flex-1". Never alter this layout contract without being asked. Navbar and Footer are imported only in BaseLayout — never in individual pages.

Use DaisyUI components and their predefined classes as the first option for any UI element that DaisyUI covers. Use .btn, .card, .modal, .alert, .badge, .input, .select, .textarea, .checkbox, .toggle, .drawer, .navbar, .menu, .tabs, .steps, .hero, and all other DaisyUI primitives directly before building anything custom. Do not reinvent what DaisyUI already provides. Use DaisyUI semantic color tokens (primary, secondary, accent, neutral, base-100, base-200, base-300, info, success, warning, error) for all color decisions — never hardcode hex values, RGB values, or Tailwind color palette values like blue-500 or gray-300 directly. Color decisions belong in the DaisyUI theme configuration.

Use only the theme and color palette defined in docs/DESIGN.md and configured in the Tailwind or DaisyUI config. Never introduce a color, font, or spacing value that is not part of the defined system. If a new token is needed, add it to the theme configuration — do not hardcode it inline.

Never hardcode arbitrary values in utility classes. Do not write text-[10px], w-[347px], mt-[13px], or any class using bracket notation unless there is no Tailwind scale equivalent and the value is truly one-off. Use the Tailwind scale: text-xs, text-sm, text-base, text-lg, w-full, w-1/2, mt-2, mt-4, gap-6, and so on. If a specific value is needed repeatedly and has no Tailwind equivalent, extend the theme in tailwind.config or the DaisyUI config — whichever the documentation recommends for that type of token — and use the named class from that point on. Never leave repeated arbitrary values scattered across components.

Never use JavaScript for styling or layout decisions. Do not toggle classes via JavaScript to control visual states that CSS or Tailwind variants can handle. Use Tailwind state variants (hover:, focus:, active:, disabled:, checked:, group-hover:, peer-, aria-, data-) and DaisyUI state modifiers to express all interactive and conditional visual states. Use CSS transitions and animations over JS-driven ones. If a visual behavior requires JavaScript, it must be because CSS genuinely cannot achieve it — not because it was easier to write.

Apply Tailwind utility classes directly in markup. Do not write custom CSS classes that wrap groups of utilities unless you are extracting a component that does not map to an .astro or framework component. Do not use @apply to replicate what a DaisyUI class or a composable set of utilities already expresses. If a pattern is repeated enough to justify abstraction, make it a component, not a CSS class.

Do not invent class names. Do not add inline styles unless there is no other path. Do not use CSS modules, styled-components, or any CSS-in-JS approach — the stack is Tailwind and DaisyUI, and that is sufficient.

Keep responsive design mobile-first. Write base styles for mobile and use sm:, md:, lg:, xl:, 2xl: prefixes to adapt for larger screens. Never write desktop-first styles and try to undo them for mobile.

For icons, use astro-icon with the Icon component from astro-icon/components. Decorative icons get aria-hidden="true". Icons that communicate meaning without visible text require aria-label. Do not use emojis as UI icons.

For images, always use the Astro Image component. Never use a bare img tag for images Astro can optimize. Remote images require explicit width and height props.
