# ADR-0015: UUID v7 como clave primaria en todas las tablas

**Estado:** Propuesta · **Fecha:** 2026-10-09

## Contexto
El móvil (Hito 8) creará registros sin conexión y los sincronizará después, y una posible migración a Expo no debe obligar a cambiar el modelo. Con un entero autoincremental el cliente no puede asignar el identificador de un registro nuevo sin riesgo de choque con el de otro dispositivo, y migrar las llaves de una base con datos reales sería caro. Decisión del usuario: priorizar el UUID.

## Decisión
- **Todas las tablas de negocio usan `id BINARY(16)` como clave primaria**, con un **UUID v7** generado por la aplicación (servidor o cliente). La API lo muestra en su forma canónica de 36 caracteres.
- **UUID v7 y no v4:** su prefijo es el tiempo, así que las inserciones caen casi al final del índice agrupado de InnoDB, como un autoincremental. Un v4 aleatorio fragmentaría la tabla y sus índices.
- **`BINARY(16)` y no `CHAR(36)`:** 16 bytes en vez de 36 en la tabla y en cada índice secundario, que en InnoDB repite la clave primaria.
- Las llaves foráneas son del mismo tipo. Las tablas de unión usan clave compuesta de las llaves de las dos tablas que unen.
- **Excepción:** las tablas de sistema que solo escriben las migraciones (`resources`, `permissions`, `number_sequences`) usan su `code` como clave natural, para sembrarlas sin inventar UUID y para que las llaves foráneas se lean solas.
- Un UUID generado por un cliente con el reloj mal puesto solo altera la localidad del índice, no la corrección: la unicidad no depende del reloj.

## Alternativas descartadas
- **`id` autoincremental + `uuid` aparte:** dos identificadores por registro, un índice único extra y el riesgo de filtrar el entero en la API; migrar a UUID después es lo que se quiere evitar.
- **UUID v4 en `CHAR(36)`:** el más simple, pero fragmenta los índices y los duplica en tamaño.
- **Autoincremental solo:** no permite crear registros sin conexión.

## Consecuencias
- Los índices pesan más que con enteros de 8 bytes; con el volumen esperado (decenas de miles de filas por tabla) no es un problema.
- En el cliente MySQL los ids se ven en binario: para depurar se usa `HEX(id)`. MySQL 5.7 no trae `BIN_TO_UUID`; la conversión se hace en la aplicación.
- Hace falta un generador de UUID v7 en PHP y otro en TypeScript (`shared/`); se elige la librería al implementar.
- Los ids no son consecutivos ni legibles. Los códigos que ve el usuario (cliente, proyecto, OC) salen de `number_sequences`.
