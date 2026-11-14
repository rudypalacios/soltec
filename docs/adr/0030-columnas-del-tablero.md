# ADR-0030: Columnas del tablero de un flujo

**Estado:** Aceptada · **Fecha:** 2026-11-14

## Contexto
El tablero de tareas (3.3c) dibuja columnas. Una columna por estado del flujo se queda corta: la empresa puede querer juntar «Aceptada» y «En ejecución» en «En curso», y un estado nuevo no debe dejar tareas fuera del tablero. El ADR-0026 solo daba al flujo estados y transiciones.

## Decisión
- **Todo estado, activo o no, pertenece a una columna** (`workflow_states.board_column_id NOT NULL`, llave foránea a `board_columns`). La configuración es de la empresa, no de cada usuario, y vive en Flujos de estado junto al motor, bajo el permiso `workflow_states` (editar). No hay columna «Sin columna».
- **Un estado nuevo nace con su propia columna** (con su nombre, al final) o entra en una columna existente si el alta lo pide; las columnas se juntan después.
- **Las columnas se reemplazan como conjunto** (`PUT /v1/workflows/{flujo}/board-columns`), como las transiciones: el orden de las columnas, sus nombres y los estados activos de cada una, en una transacción con el flujo bloqueado. Los estados activos deben aparecer exactamente una vez. Los inactivos conservan su columna.
- **Una columna sin estados se cierra** (`deleted_at` y auditoría; nada se borra). Una columna omitida que aún guarda estados inactivos se conserva al final, para que reactivar uno de ellos encuentre su columna.
- **El tablero agrupa por columna**, incluidos los estados inactivos: una tarea en un estado desactivado sigue en su columna (ADR-0026). Una columna con solo estados inactivos y sin tareas no se dibuja. Una columna con algún estado final es «final»: lista lo último que cambió primero, porque lo cerrado solo crece.
- **El tablero se lee con `GET /v1/tasks/board`**: total exacto por columna y una página por columna (`per_page`, 25 por defecto); `column_id` y `page` piden la página siguiente de una columna. Visibilidad igual a la de la lista.
- La tabla es por flujo (`workflow_code`): los tickets (3.5) usan las mismas columnas sin otra migración.

## Alternativas descartadas
- **Una columna por estado, fija:** no deja juntar estados ni nombrarlos para quien mira el tablero.
- **Columna opcional con «Sin columna»:** un estado nuevo quedaría fuera del tablero hasta que alguien lo ubicara, y sus tareas con él.
- **Configuración por usuario:** cada quien vería un tablero distinto del equipo; nadie lo pidió.
- **Reutilizar la lista (`per_page` 100) para el tablero:** corta el conteo y las tarjetas en silencio con más de 100 tareas.
- **Nombre único de columna en la base:** un estado inactivo puede repetir el nombre de uno activo, y la migración sembraría una columna por estado; el conjunto se valida al guardar.

## Consecuencias
- La migración `20261114000001` crea una columna por estado existente con el id del estado (así no necesita generar UUID en SQL) y es repetible.
- Quien edita estados ve en la tabla de Flujos de estado a qué columna va cada uno, y el diálogo «Columnas del tablero» es el único lugar donde se cambia después del alta.
- Arrastrar tarjetas entre columnas queda para después: mover una tarea sigue siendo abrirla y usar su menú de estado.
- **«Configurar tablero» se abre desde el tablero y desde Flujos de estado** con el mismo diálogo. Las reglas de mover estados y columnas son funciones puras de `shared/` (`boardColumns.ts`); en escritorio se arrastra (`@dnd-kit`, solo en `web/`) y en teléfono se usan selectores. La lista sin arrastrar también está en escritorio, porque la librería no resuelve bien el teclado entre columnas y el selector sí es accesible.
