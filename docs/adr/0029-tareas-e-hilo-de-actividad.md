# ADR-0029: Tareas e hilo de actividad

**Estado:** Aceptada · **Fecha:** 2026-11-10

## Contexto
El hilo (comentarios, cambios de estado, menciones, fotos) necesita un registro donde vivir, y los tickets (3.5) lo reutilizan. Las tareas son el primer anfitrión. Hay que decidir quién ve una tarea, quién mueve su estado, cómo se guardan las menciones y cómo ven las fotos quienes no las subieron.

## Decisión
- **Una tarea puede asignarse a su propio dueño** (seguimiento personal; decisión del usuario, 2026-11-10): no hay regla de «distinto del dueño».
- **Quién ve una tarea** (enmienda del 2026-11-10, decisión del usuario): quien la pidió, a quien se le asignó y quien fue mencionado en un comentario activo, **sin necesitar ningún permiso**; por eso leer (lista, detalle, hilo y pasar de estado) está abierto a toda sesión interna y el servicio decide. `tasks.view` con su alcance de datos solo ensancha lo que se alcanza. Escribir conserva sus permisos (`tasks.create`, `tasks.edit`, `thread_entries.*`). Quitar o desactivar el comentario que mencionaba quita ese acceso.
- **Quién mueve el estado** lo decide `TaskService`, no el motor (que sigue respondiendo solo si A→B existe): el asignado o el dueño hacen cualquier paso; **cerrar o reabrir una tarea final es solo del dueño**; el **administrador de sistema** (el perfil `admin`, que no se edita ni se borra, no cualquier perfil con todos los permisos) puede dar cualquier paso. Quien solo fue mencionado no mueve nada. Solo se usan las banderas que el motor ya tiene (inicial y final).
- **Rechazar** es un paso más del flujo con `reason` y `proposed_due_date` opcionales; la fecha propuesta queda en la tarea hasta el siguiente paso y el dueño puede aceptarla (pasa a ser el vencimiento). Exigir la fecha al rechazar necesita una bandera «pide nueva fecha» en los estados: pendiente (ver TODO.md).
- **El hilo cuelga de un `ThreadSubject`** (tipo e id, sin llave foránea): cada tipo de registro dice quién lo ve y quién puede ser mencionado. Ver el hilo exige ver el registro; comentar exige además `thread_entries.create`.
- **Dos clases de entrada:** comentario (lo escribe una persona; solo su autor lo edita o desactiva) y evento (lo escribe el módulo dueño del registro en la misma transacción del cambio; no se edita ni se desactiva). El orden lo da `(created_at, seq)`: el id de tiempo no basta para entradas del mismo milisegundo.
- **Menciones:** el texto guarda `@[id-del-usuario]` y la API devuelve los nombres actuales. Se puede mencionar a cualquier usuario interno activo (`invalid_mention` si no lo es) y **la mención le da acceso a la tarea y su hilo** mientras el comentario siga activo. La conversión con lo que la persona escribe (`@Nombre`) vive en `shared/`.
- **Fotos de un comentario:** hasta 5, subidas por quien comenta; al editar el comentario el autor puede quitar fotos y agregar otras (`file_ids` reemplaza el conjunto, la auditoría guarda el anterior). Quien ve el registro las ve gracias a `FileAccessGrant` (implementado por el hilo); desactivar el comentario quita ese acceso. Ver una foto no da permiso para desactivarla.
- **Reintentos:** el cliente elige el `id` del comentario (UUID v7); repetirlo con el mismo texto responde 200 sin duplicar.

## Alternativas descartadas
- **Permisos por transición según el perfil:** nadie lo pidió; la regla de dueño/asignado cubre CU004.
- **Guardar el nombre en el texto de la mención:** un cambio de nombre dejaría comentarios viejos con el nombre anterior.
- **Un hilo por tabla de cada tipo de registro:** duplicaría comentarios, menciones y fotos en tareas y tickets.

## Consecuencias
- Los tickets (3.5) agregan su `ThreadSubject` y su ruta; el hilo no cambia.
- El aviso de asignación y de menciones queda para 3.4: `thread_entry_mentions` ya guarda a quién.
- Una tarea desactivada conserva su hilo y sus fotos.
- Mencionar es compartir: cualquiera que ya vea la tarea puede dar acceso a otra persona interna. Se aceptó porque es lo que la gente espera de una mención; si pesara, se limitaría con un permiso.
