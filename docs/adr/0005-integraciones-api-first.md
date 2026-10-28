# ADR 0005 — Integraciones API-first

- **Estado:** Recomendado
- **Fecha:** 2026-10-23
- **Decisores:** Arquitectura, Integraciones, Seguridad

## Contexto

La aplicación actual integra InvGate de tres formas:

1. API REST con Basic auth.
2. Scraping web con Playwright y SSO Azure para la línea de tiempo.
3. Scraping de MidPoint para sincronizar usuarios.

El scraping:

- Corre dentro de requests (`/api/calidad/ai-evaluate`).
- Usa `headless:false` por defecto.
- Guarda la cookie `IGSMSESSID` en claro en `database/`.
- Depende de `@playwright/test` (devDependency).
- Es frágil ante cambios de UI.

## Decisión

Adoptar **API-first**:

1. Toda integración usa API documentada o contrato formal.
2. El scraping se elimina o se mueve a un worker dedicado, fuera del request.
3. Los adapters tienen timeout, retry, circuit breaker y caché.
4. Los contratos se validan con Zod y se cubren con tests.
5. Los secretos viven en entorno/vault.
6. Los IDs de configuración (helpdesk, categoría, vista) van por entorno validado.

## Consecuencias

### Positivas

- Menos fragilidad.
- Sin navegador en el servidor.
- Mejor performance y observabilidad.
- Deploy `--omit=dev` viable.

### Negativas

- Requiere que InvGate/MidPoint expongan los datos necesarios.
- Puede haber gaps funcionales (p. ej. línea de tiempo).
- Más trabajo inicial de contrato.

### Mitigaciones

- Solicitar endpoints a Integraciones.
- Si no hay API, worker aislado con feature flag.
- Cachear resultados y degradar con aviso.

## Pendientes

- ¿InvGate expone la línea de tiempo por API?
- ¿MidPoint tiene API REST disponible?
- ¿Wise CX wallboard tiene contrato estable?
- ¿Se permite tráfico saliente a esos hosts?

## Referencias

- `docs/architecture/02-mapa-dependencias.md`
- `docs/architecture/09-observabilidad-y-errores.md`
