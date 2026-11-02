# [DEPRECADO] Guía y Prompt para Gemini Spark (Legacy)

> [!WARNING]
> **FLUJO DEPRECADO:** Este procedimiento basado en prompts web para Gemini Spark ha sido reemplazado por la Skill nativa de agente:
> 👉 **[`generate-changelog`](file:///D:/correo-argentino-mda/.slim/worktrees/changelog/docs/skills/generate-changelog/SKILL.md)** (disponible en `docs/skills/generate-changelog/SKILL.md` y `.agents/skills/generate-changelog/SKILL.md`).
>
> Para generar o actualizar el changelog, invocá directamente a un agente (Antigravity CLI / Copilot / GitHub Action) solicitándole:
> *"Generá las novedades del changelog para la fecha YYYY-MM-DD usando la skill generate-changelog"*.

---

*(El contenido legacy a continuación se conserva únicamente como referencia histórica)*

## 1. Procedimiento de Publicación con Gemini Spark (Histórico)

1. Abre **Gemini Spark** en el navegador.
2. Pega el **Prompt de la Sección 2** en la sesión de Gemini Spark.
3. Copia el archivo Markdown que genere y guárdalo en `src/config/changelog/YYYY-MM-DD.md`.
4. Ejecuta siempre la validación local: `npm run changelog:validate`.

---

## 2. Prompt Estandarizado Legacy

```markdown
Actúa como Technical Writer y Product Manager del "Portal MDA" (plataforma web interna de soporte y operaciones de Correo Argentino).
...
```
