# ADR-0022: Identificación fiscal de clientes y proveedores

**Estado:** Aceptada · **Fecha:** 2026-10-12 · **Enmendada:** 2026-10-14

## Contexto
Clientes y proveedores se identifican con NIT, con CUI (persona individual) o con nada: un cliente de la economía informal es real y se factura como consumidor final. El requerimiento pide impedir duplicados. Varios asesores pueden querer registrar al mismo cliente, y un mensaje que diga de quién es el registro permitiría robar leads.

## Decisión
- **Tipo:** `nit`, `cui` o `none`, elegido por quien registra. No existe un cliente «consumidor final» genérico.
- **Forma canónica:** mayúsculas, sin espacios ni guiones (`66479126`). La API acepta y muestra la forma con guion (`6647912-6`).
- **NIT:** número y dígito verificador. Con los dígitos del número, el primero multiplica por `n + 1`, el segundo por `n`, hasta el último por `2` (`n` = cantidad de dígitos); `verificador = (11 − suma mod 11) mod 11`, y `10` se escribe `K`. Confirmado con cuatro NIT reales válidos y tres inválidos, que serán los vectores de prueba en `contract/test-vectors/identification.json`.
- **CUI:** 13 dígitos. No se valida el dígito verificador ni el municipio, que requeriría una tabla de municipios; se amplía si hace falta.
- **Unicidad:** la identificación no se repite entre registros de la misma tabla. El tipo `none` no participa. El índice único sobre `active_identification` (README del ERD) respalda la regla entre activos; la regla completa, que incluye a los desactivados, la aplica el servidor (enmienda de abajo).
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

## Enmienda (2026-10-14): un registro desactivado conserva su identificación
Al construir los proveedores se vio que «desactivar libera la identificación» permitía registrar de nuevo un NIT que ya existía inactivo, y la base terminaba con dos registros con la misma información.
- **Desactivar reserva la identificación.** Registrar o editar con la de un registro inactivo responde `409 identification_inactive`: se reactiva el existente, con su historial y su auditoría, y se corrige. El `409 identification_taken` (el que tiene un registro activo) sigue sin decir de quién es.
- **Quien puede reactivar** (`<recurso>.deactivate`) recibe en el error el id y el nombre del registro inactivo y la pantalla le ofrece «Reactivar». Quien no puede solo lee que existe uno inactivo y que debe pedir su reactivación a administración.
- **Clientes (2.5):** la misma regla, pero el error nunca nombra el registro, por el riesgo de robo de leads (ADR-0025); solo se avisa que existe y se consulta con el jefe directo o con administración.
- **Alternativa descartada:** avisar y dejar continuar, que reabre el problema de los duplicados.
- **Consecuencia:** el caso «reactivar y encontrar la identificación tomada» solo puede darse con datos anteriores a la regla; se mantiene el `409` por si ocurre.
