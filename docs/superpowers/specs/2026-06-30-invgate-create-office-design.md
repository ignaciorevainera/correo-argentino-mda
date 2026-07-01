# Diseño: Creación de Oficina desde InvGate

## Contexto
Actualmente, las ubicaciones de InvGate que no tienen match en la base de datos de MDA se muestran con una etiqueta de "Sin match". El administrador necesita una forma rápida de registrar estas oficinas directamente desde esta vista, evitando tener que copiar y pegar manualmente la información en el formulario convencional de creación de oficinas.

## Arquitectura y Flujo

1. **Interfaz de Usuario (Frontend)**
   - En cada fila (componente `UbicacionRow.astro`) con estado "Sin match", se añadirá un botón (ej: icono de añadir "plus") al lado de los detalles de la oficina.
   - Al hacer clic, se abrirá un `<dialog class="modal">` de DaisyUI que mostrará un formulario para crear la oficina.
   - El formulario del modal estará precompletado con los datos extraídos de la ubicación de InvGate:
     - **NIS** (`invgateLocation.nis`)
     - **Centro de Costos** (`invgateLocation.cc`)
     - **Nombre de la Oficina** (`invgateLocation.displayName` - sin limpieza automática; el admin deberá limpiarlo manualmente en el input).
     - **Provincia / Dirección** (si estuviesen disponibles en el parseo, sino quedarán como inputs vacíos o parciales).
   - El modal incluirá un campo `<select>` obligatorio para elegir el **Tipo de Oficina**, utilizando las opciones existentes en `src/lib/officeHelpers.ts` (`officeTypeLabelByType`).

2. **Envío de Datos y Manejo de Estado (Frontend)**
   - El envío se realizará sin recargar la página, mediante una petición `fetch` en Vanilla JS (o un script inline dentro del modal).
   - Se mostrará un indicador de carga (`loading`) en el botón de submit durante la petición.
   - Al recibir éxito, se mostrará un componente de **Toast** en la esquina de la pantalla y se cerrará el modal automáticamente.
   - Opcionalmente, se puede ocultar la fila correspondiente o actualizar su estado a "Match" de manera optimista, aunque el requerimiento principal es mostrar el toast.

3. **API (Backend)**
   - Se creará un nuevo endpoint `POST` en `src/pages/api/admin/offices/create.ts` (o similar ruta, por ejemplo `/api/invgate/offices/create.ts`).
   - El endpoint validará la autenticación y permisos (solo administradores).
   - Validará el payload (JSON) que incluirá `name`, `code` (NIS), `ccAdmin` u otro campo para el CC, `type` y opcionalmente `officeType`.
   - Utilizará el helper de auditoría (`logAdminAction`) para registrar la acción.
   - Insertará el registro en la base de datos y devolverá `200 OK` con un JSON indicando éxito.

## Consideraciones de Diseño
- **Reutilización**: Se reutilizarán los esquemas de base de datos (`offices`) y los helpers de tipos de oficina (`officeTypeLabelByType`).
- **Scroll Infinito**: Al utilizar `fetch` para el POST, no se interrumpirá el scroll infinito de la tabla de ubicaciones de InvGate.
- **Validación de NIS/Code**: Como el NIS corresponde a la columna `code` y es `UNIQUE`, el endpoint deberá manejar correctamente el error de unicidad (si el NIS ya existe, devolver un error 400 y mostrarlo en un toast).

## Manejo de Errores
- Si la inserción falla (ej: código duplicado o falta de provincia obligatoria en el esquema actual de DB, dado que `provinceCode` no es null, se requerirá seleccionarlo o setear uno por defecto en el modal si no se puede deducir), se mostrará un toast de error.

## TBD
- El esquema `offices` requiere `provinceCode` como `notNull()`. Dado que InvGate no provee este dato directamente en un formato fácilmente mapeable, el modal deberá incluir un `<select>` para la Provincia.
