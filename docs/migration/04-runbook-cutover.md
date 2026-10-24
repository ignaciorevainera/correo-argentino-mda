# 04 — Runbook de cutover

> Procedimiento operativo para habilitar un módulo en la nueva aplicación y, si falla, volver al legado.
> Aplicable por módulo. El primer uso será el piloto Títulos.

## 1. Principios

1. **Cutover por módulo**, no por sistema completo.
2. **Proxy como interruptor.** El legado y el nuevo conviven detrás de NGINX.
3. **Sin dual-write.** Un módulo escribe en un solo lugar.
4. **Rollback en minutos.** Volver el proxy al legado.
5. **Verificación antes de abrir.** Health, datos, permisos.
6. **Comunicación explícita.** Usuarios saben qué cambia y cuándo.

## 2. Precondiciones

- [ ] Módulo migrado y reconciliado.
- [ ] E2E del módulo verdes.
- [ ] Seguridad revisada (CSRF, authz, XSS).
- [ ] Performance dentro de presupuesto.
- [ ] Backup verificado.
- [ ] Rollback ensayado.
- [ ] Health checks funcionando.
- [ ] Alertas configuradas.
- [ ] Ventana acordada.
- [ ] Responsables disponibles.

## 3. Topología

```
                    ┌─────────────────────┐
Usuario ──HTTPS──►  │ NGINX :443          │
                    │                     │
                    │ /titulos  ──────────┼──► Next.js :3000 (nuevo)
                    │ /*        ──────────┼──► Astro  :4321 (legado)
                    └─────────────────────┘
```

Reglas:

- El proxy decide por prefijo de ruta.
- El legado sigue disponible para el resto de los módulos.
- La sesión debe ser compatible o se fuerza re-login.
- Los assets del nuevo van por `/_next/static`.

## 4. Ejemplo de configuración NGINX

```nginx
upstream mda_legacy { server 127.0.0.1:4321; }
upstream mda_next   { server 127.0.0.1:3000; }

server {
  listen 443 ssl;
  server_name mda.correo.local;

  # Nuevo módulo
  location /titulos {
    proxy_pass http://mda_next;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  location /_next/ {
    proxy_pass http://mda_next;
    proxy_set_header Host $host;
  }

  # Resto en legado
  location / {
    proxy_pass http://mda_legacy;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Notas:

- Ajustar certificados y timeouts.
- No cachear HTML autenticado.
- Cachear `/_next/static` de forma inmutable.
- Verificar que las cookies no colisionen.

## 5. Línea de tiempo

### T-7 días

- [ ] Congelar alcance del módulo.
- [ ] Ensayo de migración en staging.
- [ ] Ensayo de rollback.
- [ ] Comunicación a usuarios.
- [ ] Backup completo.

### T-1 día

- [ ] Dry-run final con datos de producción.
- [ ] Reporte de reconciliación.
- [ ] Confirmar ventana y responsables.
- [ ] Verificar health del nuevo.
- [ ] Verificar logs y alertas.

### T-0 (ventana)

1. Avisar inicio.
2. Poner el legado en read-only para el módulo (si aplica).
3. Ejecutar migración final `--apply`.
4. Reconciliar.
5. Cambiar el proxy.
6. Smoke test.
7. Avisar habilitación.

### T+1 hora

- [ ] Errores 5xx.
- [ ] Latencia.
- [ ] Login.
- [ ] Permisos.
- [ ] Datos visibles.
- [ ] Export/import.
- [ ] Feedback de usuarios.

### T+1 día

- [ ] Métricas estables.
- [ ] Sin P1.
- [ ] Datos consistentes.
- [ ] Decisión: continuar o rollback.

### T+7 días

- [ ] Cerrar incidentes.
- [ ] Postmortem.
- [ ] Documentar lecciones.
- [ ] Planificar siguiente módulo.

## 6. Smoke test

| # | Verificación | Esperado |
|---|---|---|
| 1 | `GET /api/health/ready` | 200 |
| 2 | Login con usuario de prueba | 200 + cookie |
| 3 | `GET /titulos` | 200 + listado |
| 4 | Búsqueda | resultados correctos |
| 5 | Favorito | persiste |
| 6 | Crear/editar/borrar | 200 + auditoría |
| 7 | Export CSV | archivo válido |
| 8 | Acceso sin sesión | redirect a login |
| 9 | Acceso con rol insuficiente | 403 |
| 10 | CSRF inválido | 403 |
| 11 | Datos reconciliados | conteos iguales |
| 12 | Logs con requestId | presentes |

## 7. Rollback

### Disparadores

- 5xx > 5% durante 15 min.
- Pérdida o corrupción de datos.
- Permisos incorrectos.
- Performance inaceptable.
- Decisión de negocio.

### Procedimiento

1. Avisar rollback.
2. Revertir proxy al legado.
3. Poner el nuevo en read-only.
4. Restaurar datos si hubo escrituras.
5. Verificar legado.
6. Comunicar.
7. Postmortem.

### Tiempo objetivo

- Proxy: < 5 min.
- Datos: según backup (definir con DBA).

## 8. Comunicación

| Momento | Canal | Mensaje |
|---|---|---|
| T-7 | Correo/Teams | Qué cambia, cuándo, qué hacer |
| T-1 | Correo/Teams | Recordatorio y ventana |
| T-0 | Correo/Teams | Inicio |
| T+0 | Correo/Teams | Habilitado |
| Rollback | Correo/Teams | Vuelta atrás y motivo |

## 9. Postmortem

- Qué salió bien.
- Qué falló.
- Impacto.
- Causa raíz.
- Acciones con dueño y fecha.
- Actualización de runbook.

## 10. Checklist final

- [ ] Backup.
- [ ] Migración aplicada.
- [ ] Reconciliación.
- [ ] Proxy.
- [ ] Smoke.
- [ ] Monitoreo.
- [ ] Comunicación.
- [ ] Rollback disponible.
- [ ] Postmortem agendado.
