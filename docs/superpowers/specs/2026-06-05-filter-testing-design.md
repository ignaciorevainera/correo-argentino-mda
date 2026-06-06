# Diseño de Pruebas de Filtros y Ordenamiento en Inventario

Este documento define la estrategia para verificar que los filtros de búsqueda, selección de sistema operativo, variante, arquitectura, marca, RAM, estado y ordenamiento de terminales funcionen correctamente e interactúen de forma dinámica con el backend (API) para cargar datos que no están inicialmente en el DOM.

## Objetivos
- Validar la interacción de la interfaz de usuario con la API de terminales (`/api/terminals`).
- Probar todas las combinaciones de filtros de la vista de terminales.
- Probar el ordenamiento por columnas (Hostname, Hardware, Sistema Operativo, Ubicación).
- Confirmar que la paginación infinita y la actualización del DOM reflejan los datos filtrados en tiempo real.

## Plan de Pruebas
1. **Inicialización**: Iniciar servidor Astro local.
2. **Navegación**: Cargar la página `http://localhost:4321/inventario-equipos`.
3. **Prueba de Filtro de SO y Variante**:
   - Seleccionar "Windows 10".
   - Esperar a que la variante de SO esté habilitada.
   - Seleccionar una variante si está disponible y validar que las filas mostradas corresponden a ese filtro.
4. **Prueba de Filtro de Arquitectura**:
   - Seleccionar "64 bits" y "32 bits".
   - Verificar la correspondencia de datos.
5. **Prueba de Filtro de Marca y RAM**:
   - Seleccionar marcas como Dell o Lenovo.
   - Seleccionar límites de RAM (ej: `<=1gb` o `>=32gb`).
6. **Prueba de Ordenamiento**:
   - Hacer clic en la cabecera "Hostname".
   - Verificar que se ordenen de manera ascendente y descendente.
