# ADR-0025: Clientes con varios asesores, contactos propios y perfil externo reducido

**Estado:** Aceptada · **Fecha:** 2026-10-12 · **Enmendada:** 2026-10-14

## Contexto
Una empresa cliente puede tener varias personas con las que hablan asesores distintos (RR. HH., ventas, taller), a las que cada uno vende algo diferente. Cada asesor debe ver solo a sus clientes y a sus propios contactos, para que no se roben leads. El cliente externo del portal debe ver su propio perfil y nada de la cartera interna.

## Decisión
- **Asesores del cliente:** tabla `client_sellers` (`client_id`, `user_id`, `is_responsible`). Hay exactamente un responsable (la regla 4.1: vendedor asignado), garantizado con un índice único sobre una columna generada. Los **prospectos** tienen un solo asesor; solo los **clientes de venta** se comparten.
- **Alcance de `clients`:** `own` ve los clientes donde el usuario es asesor; `team`, los de su equipo; `all`, todos. `ScopedQuery` gana un filtro por tabla de vínculo.
- **Quién administra los asesores de un cliente:** el responsable y quien tenga `team` o `all` sobre él. Un asesor vinculado no quita a otro.
- **Contactos propios:** `contacts.owner_id` es quien lo ingresó. `own` ve los suyos, `team` los de su equipo, `all` todos. Que un contacto esté vinculado a un cliente **no** lo hace visible al resto de los asesores del cliente. Los contactos de un proveedor **no son contactos de asesor**: son personas propias del proveedor (`supplier_contacts`), sin dueño ni alcance, que ve quien pueda ver ese proveedor (no es una cartera personal).
- **Reasignar:** reemplazar a un asesor por otro. Por defecto pasan al nuevo los contactos del saliente vinculados a ese cliente, salvo los vinculados a varios clientes, que quedan para el administrador. Una operación en bloque (`POST /v1/clients/reassign`) mueve la cartera completa de un vendedor, y es lo que hace falta antes de desactivarlo (ADR-0023).
- **Cliente externo:** el recurso `client_profile` es el único que reciben los roles externos. Lo sirve `GET /v1/me/client`, sin id, así que el aislamiento entre clientes ocurre por construcción. Devuelve una proyección reducida: nombre, identificación, régimen fiscal y direcciones. **Nunca** el estado del cliente, el segmento, el nivel de margen, los asesores ni los contactos.
- **Contactos de una cuenta externa:** `users.contact_id` apunta a la persona del cliente, pero esa persona no es legible por el portal.

## Alternativas descartadas
- **`seller_id` único en el cliente:** no cubre empresas atendidas por varios asesores.
- **Contactos visibles por el cliente compartido:** un asesor vería el directorio que construyó otro.
- **Una proyección condicional en `GET /v1/clients/{id}`:** una sola ruta con dos formas y el riesgo de filtrar campos internos por un descuido.
- **Un flujo de solicitud de acceso desde ya:** depende de tareas y notificaciones (Hito 3).

## Consecuencias
- `ScopedQuery` y la lista de clientes pagan una subconsulta por la unión; con el volumen esperado, un índice por `user_id` basta.
- El responsable se puede quedar sin acceso si se le quita de la lista: la regla del código lo impide (siempre hay uno).
- Cuando exista el flujo de solicitud (Hito 3 o posterior), un asesor podrá pedir acceso a un registro existente sin cambiar este modelo.

## Enmienda (2026-10-15): cómo quedó el alcance `client` y el perfil externo (rebanada 2.5)
- **Alcance `client`:** no abre ninguna lista. Un usuario externo llega a su cliente solo por `GET /v1/me/client`, que lee `users.client_id` de la cuenta firmada; en `ScopedQuery` el alcance `client` no encuentra nada, de modo que un alcance guardado nunca abre más datos de los previstos. El aislamiento entre clientes no depende de un filtro que alguien pueda olvidar: la ruta no tiene id.
- **`resources.audience`** (`internal` o `external`): la matriz de los perfiles internos ofrece solo los recursos internos, así que `client_profile` no puede llegar a un perfil interno. Un perfil externo con ese recurso lo crea el portal (Hito 9); hasta entonces las pruebas lo insertan directo.
- **Perfil externo:** devuelve también el nombre fiscal (`legal_name`) del perfil de facturación, que es un dato del propio cliente. Un cliente desactivado no tiene perfil (404).
- **Quién administra los asesores:** el responsable y quien alcance al cliente con `team` o `all`; el nuevo asesor puede ser cualquier usuario interno activo (no se exige que sea del equipo de quien lo agrega, porque el responsable de un cliente con alcance `own` no tiene equipo que mirar).
- **Traspaso con contactos:** pasan al nuevo asesor los contactos del saliente vinculados únicamente a los clientes que se entregan; los vinculados además a otro cliente que se queda conservan su dueño y se informan como `contacts_kept`.

## Enmienda (2026-10-14): contactos de proveedor aparte
Al construir los proveedores (rebanada 2.3b) el modelo original los vinculaba con la misma tabla `contacts` que usan los asesores. Eso arrastraba el dueño y el alcance a los proveedores, que no los tienen: un proveedor le vende a la empresa, no es una cartera de un asesor, y cualquiera que lo vea debe ver sus contactos.
- Los contactos de proveedor viven en `supplier_contacts`, dentro del proveedor, con los mismos datos que un contacto más el cargo y el tipo de contacto. No tienen dueño, alcance ni permiso propio.
- `contacts` queda solo para las personas de los asesores, y se vincula a clientes en la 2.5 (`client_contacts`). La unión `supplier_contacts(supplier_id, contact_id, contact_type_id)` del ERD original no se crea.
- **Costo:** quien es contacto de un cliente y de un proveedor se registra dos veces. Son relaciones comerciales distintas; compartir la fila arrastraría el alcance de una a la otra.
- **Alternativa descartada:** un campo `kind` en `contacts`, que obligaría a admitir «sin dueño» y a filtrar por tipo en cada consulta, justo el cruce que se quería evitar.
