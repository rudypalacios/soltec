# ADR-0022: Identificación fiscal de clientes y proveedores

**Estado:** Aceptada · **Fecha:** 2026-10-12

## Contexto
Clientes y proveedores se identifican con NIT, con CUI (persona individual) o con nada: un cliente de la economía informal es real y se factura como consumidor final. El requerimiento pide impedir duplicados. Varios asesores pueden querer registrar al mismo cliente, y un mensaje que diga de quién es el registro permitiría robar leads.

## Decisión
- **Tipo:** `nit`, `cui` o `none`, elegido por quien registra. No existe un cliente «consumidor final» genérico.
- **Forma canónica:** mayúsculas, sin espacios ni guiones (`66479126`). La API acepta y muestra la forma con guion (`6647912-6`).
- **NIT:** número y dígito verificador. Con los dígitos del número, el primero multiplica por `n + 1`, el segundo por `n`, hasta el último por `2` (`n` = cantidad de dígitos); `verificador = (11 − suma mod 11) mod 11`, y `10` se escribe `K`. Confirmado con cuatro NIT reales válidos y tres inválidos, que serán los vectores de prueba en `contract/test-vectors/identification.json`.
- **CUI:** 13 dígitos. No se valida el dígito verificador ni el municipio, que requeriría una tabla de municipios; se amplía si hace falta.
- **Unicidad:** la identificación no se repite entre registros activos de la misma tabla, con una columna generada `active_identification` e índice único (README del ERD). El tipo `none` no participa. Desactivar un registro libera su identificación; reactivarlo cuando otro ya la usa responde `409`.
- **Mensaje fijo:** el `409 identification_taken` no dice de quién es el registro. La pantalla sugiere consultarlo con el jefe directo (por nombre, si tiene) o con administración.
- **Aviso por nombre:** al registrar, la búsqueda de coincidencias de nombre solo mira dentro del alcance de quien registra.

## Alternativas descartadas
- **Mostrar el dueño del registro existente:** sirve a la higiene pero habilita el robo de leads.
- **No validar duplicados:** la base se llena de repetidos y se pierde la unicidad que la facturación necesita.
- **Flujo de solicitud de acceso al registro existente:** necesita tareas y notificaciones (Hito 3). Queda anotado como pendiente.
- **Validar el CUI completo:** exige datos de municipios por una regla que nadie ha pedido.

## Consecuencias
- Un cliente compartido por dos asesores es **un** registro con dos asesores (ADR-0025), no dos registros.
- El mismo NIT puede existir una vez como cliente y otra como proveedor: son tablas distintas.
- La función de validación vive en PHP, con sus vectores. La web muestra el error del servidor; no la duplica (ADR-0006).
