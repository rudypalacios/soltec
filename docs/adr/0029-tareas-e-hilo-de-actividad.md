# ADR-0029: Tareas e hilo de actividad

**Estado:** Aceptada · **Fecha:** 2026-11-10

## Contexto
El hilo (comentarios, cambios de estado, menciones, fotos) necesita un registro donde vivir, y los tickets (3.5) lo reutilizan. Las tareas son el primer anfitrión. Hay que decidir quién ve una tarea, quién mueve su estado, cómo se guardan las menciones y cómo ven las fotos quienes no las subieron.

## Decisión
- **Quién ve una tarea:** su dueño, su asignado y lo que dé el alcance de datos de `tasks`, que mira las dos personas (`ScopedQuery::restrictAny`). Fuera de eso la tarea no existe (404).
- **Quién mueve el estado** lo decide `TaskService`, no el motor (que sigue respondiendo solo si A→B existe): el asignado o el dueño hacen cualquier paso; **cerrar o reabrir una tarea final es solo del dueño**. Solo se usan las banderas que el motor ya tiene (inicial y final).
- **Rechazar** es un paso más del flujo con `reason` y `proposed_due_date` opcionales; la fecha propuesta queda en la tarea hasta el siguiente paso y el dueño puede aceptarla (pasa a ser el vencimiento). Exigir la fecha al rechazar necesita una bandera «pide nueva fecha» en los estados: pendiente (ver TODO.md).
- **El hilo cuelga de un `ThreadSubject`** (tipo e id, sin llave foránea): cada tipo de registro dice quién lo ve y quién puede ser mencionado. Ver el hilo exige ver el registro; comentar exige además `thread_entries.create`.
- **Dos clases de entrada:** comentario (lo escribe una persona; solo su autor lo edita o desactiva) y evento (lo escribe el módulo dueño del registro en la misma transacción del cambio; no se edita ni se desactiva). El orden lo da `(created_at, seq)`: el id de tiempo no basta para entradas del mismo milisegundo.
- **Menciones:** el texto guarda `@[id-del-usuario]` y la API devuelve los nombres actuales. Solo se menciona a usuarios internos activos que ya ven el registro (`invalid_mention`). La conversión con lo que la persona escribe (`@Nombre`) vive en `shared/`.
- **Fotos de un comentario:** hasta 5, subidas por quien comenta. Quien ve el registro las ve gracias a `FileAccessGrant` (implementado por el hilo); desactivar el comentario quita ese acceso. Ver una foto no da permiso para desactivarla.
- **Reintentos:** el cliente elige el `id` del comentario (UUID v7); repetirlo con el mismo texto responde 200 sin duplicar.

## Alternativas descartadas
- **Permisos por transición según el perfil:** nadie lo pidió; la regla de dueño/asignado cubre CU004.
- **Guardar el nombre en el texto de la mención:** un cambio de nombre dejaría comentarios viejos con el nombre anterior.
- **Un hilo por tabla de cada tipo de registro:** duplicaría comentarios, menciones y fotos en tareas y tickets.

## Consecuencias
- Los tickets (3.5) agregan su `ThreadSubject` y su ruta; el hilo no cambia.
- El aviso de asignación y de menciones queda para 3.4: `thread_entry_mentions` ya guarda a quién.
- Una tarea desactivada conserva su hilo y sus fotos.
