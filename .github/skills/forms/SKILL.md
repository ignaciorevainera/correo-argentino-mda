---
name: forms
description: Build accessible forms following project conventions. Use when creating or modifying any form, to apply correct DaisyUI components, three-state handling (idle, loading, result), validation layers, and accessibility rules.
metadata:
  author: ignacio-revainera
  version: "1.0.0"
  argument-hint: <form-name-or-task>
---

## Cuando leer esta skill
Antes de crear o modificar cualquier formulario en el proyecto.

## Estructura de un formulario

Todo formulario en este proyecto sigue esta estructura de capas:

  Capa 1 — UI del formulario (componente en src/components/)
    Solo presenta el formulario y comunica eventos. Sin logica de envio.

  Capa 2 — Logica de envio (en el componente con client:load o en pagina)
    Maneja el submit, el estado y llama a la funcion de datos.

  Capa 3 — Funcion de datos (en src/lib/)
    Hace el llamado real a la base de datos o API. Solo si aplica.

## Componentes DaisyUI para formularios

Usar siempre los componentes nativos de DaisyUI:

  Contenedor: form-control
  Label: label con label-text dentro
  Input: input con variantes input-bordered, input-primary, input-error
  Textarea: textarea con variantes textarea-bordered
  Select: select con variantes select-bordered
  Checkbox: checkbox
  Radio: radio
  Toggle: toggle
  Boton de envio: btn btn-primary

Ejemplo de campo correcto:

  <div class="form-control w-full">
    <label class="label" for="email">
      <span class="label-text">Correo electronico</span>
    </label>
    <input
      type="email"
      id="email"
      name="email"
      placeholder="tu@email.com"
      class="input input-bordered w-full"
      required
    />
  </div>

## Estados obligatorios

Todo formulario debe implementar estos tres estados:

  Estado de reposo:
    El formulario en su estado inicial, listo para completar.

  Estado de carga:
    Mientras se procesa el envio. El boton muestra loading de DaisyUI
    y se deshabilita para evitar envios multiples.

    <button class="btn btn-primary" disabled={isLoading}>
      {isLoading ? <span class="loading loading-spinner" /> : 'Enviar'}
    </button>

  Estado de resultado:
    Exito: alerta con alert-success de DaisyUI
    Error: alerta con alert-error de DaisyUI
    El mensaje debe ser util para el usuario, no un error tecnico.

## Validacion

Usar validacion nativa de HTML como primera capa:
  required, type="email", minlength, maxlength, pattern

Agregar validacion en el submit handler como segunda capa antes de
llamar a cualquier funcion de datos.

Mostrar errores de validacion junto al campo que los tiene usando
label-text-alt de DaisyUI:

  <label class="label">
    <span class="label-text-alt text-error">Este campo es obligatorio</span>
  </label>

## Accesibilidad en formularios

- Cada input debe tener un label asociado mediante el atributo for/htmlFor
- Nunca usar placeholder como reemplazo del label
- El boton de submit debe tener texto descriptivo, no solo "Enviar"
  si el contexto no es obvio
- Los mensajes de error deben estar asociados al campo con aria-describedby

## Formularios con envio a base de datos

Si el formulario guarda datos, invocar al agente fullstack para que
maneje la conexion. La UI del formulario la construye ui-designer y la
conexion con datos la implementa db-engineer o fullstack.