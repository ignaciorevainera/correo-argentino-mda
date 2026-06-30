import { themeChange } from "theme-change";

(() => {
    const savedTheme = localStorage.getItem("theme");
    const theme =
        savedTheme === "light" || savedTheme === "dark"
            ? savedTheme
            : "light";

    document.documentElement.setAttribute("data-theme", theme);
})();

themeChange();

const themeToggle = document.getElementById(
    "theme-toggle",
) as HTMLInputElement | null;

const updateThemeToggle = (): void => {
    const isDark =
        document.documentElement.getAttribute("data-theme") === "dark";

    if (themeToggle) {
        themeToggle.checked = isDark;
        themeToggle.setAttribute(
            "aria-label",
            isDark ? "Activar modo claro" : "Activar modo oscuro",
        );
    }
};

themeToggle?.addEventListener("change", () => {
    window.setTimeout(() => {
        updateThemeToggle();
    }, 0);
});

const themeObserver = new MutationObserver(() => {
    updateThemeToggle();
});

themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
});

updateThemeToggle();
