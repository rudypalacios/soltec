# ADR-0024: Permisos por sección y listas de opciones

**Estado:** Aceptada · **Fecha:** 2026-10-12

## Contexto
Administrar una sección (ver su lista completa, crear, editar, desactivar) es distinto de usar sus valores en otra. Quien edita productos necesita elegir proveedor, marca y unidad, pero puede no tener derecho a entrar a Proveedores ni a Marcas. Un solo permiso para todo el catálogo no da esa granularidad.

## Decisión
- **Cada sección es su propio recurso de permisos**, con los cuatro permisos de siempre (`view`, `create`, `edit`, `deactivate`): `products`, `bundles`, `brands`, `areas`, `product_groups`, `units_of_measure` (categorías y unidades), `suppliers`, `contacts`, `clients`, y los cinco parámetros `contact_types`, `client_statuses`, `segments`, `tax_regimes` y `payment_methods`.
- **Listas de opciones:** cada lista que otro formulario necesita ofrece `GET /v1/<recurso>/options`, que devuelve solo `id`, nombre y el dato mínimo para elegir (el `area_id` de un grupo, la categoría de una unidad, el color de un estado) de los valores **activos**. **La puede leer cualquier usuario interno con sesión** (regla `internal` de `x-permission`), tenga o no permiso sobre la sección de origen. Lo que se cierra con `ver` es la ruta, el menú y la tabla principal de la sección, no sus valores como opción. Un usuario externo (portal) nunca las lee (2026-10-13: antes decía «cualquier permiso», luego «crear o editar en el consumidor» y luego «ver el consumidor»; los tres obligaban a mantener un mapa de consumidores y dejaban vacío el selector de quien no lo estuviera).
- **Alcance:** las listas de recursos con dueño respetan el alcance del llamante sobre ese recurso (`own`, `team`, `all`). Hoy, los posibles dueños de un contacto se calculan con el alcance sobre `contacts`.
- **Acciones:** las acciones nunca se heredan por ver una lista. Crear, editar y desactivar piden el permiso del recurso de origen desde cualquier pantalla: un «crear rápido» dentro de un selector llama a la misma ruta de alta y falla con `403` sin `<recurso>.create`; la web oculta el botón con ese mismo permiso.
- **La administración sí exige el permiso del propio recurso:** la lista completa, los inactivos y el alta, edición y desactivación. 
- **Recursos de audiencia externa:** un rol externo solo recibe recursos marcados para clientes externos (hoy `client_profile`, ADR-0025). Guardar un rol externo con un recurso interno se rechaza.
- El alcance de datos (`own`, `team`, `all`, `client`) solo aplica a los recursos con dueño: `contacts` y `clients`.

## Alternativas descartadas
- **Un recurso por área funcional** (`catalog` para todo): quien edita productos administraría también marcas y proveedores.
- **Dejar las opciones abiertas a todo usuario con sesión, externos incluidos:** un cliente del portal vería los proveedores y usuarios de la empresa. Se resolvió limitando a usuarios internos.
- **Un mapa de «quién consume a quién» (como estuvo en la primera versión):** cada sección nueva debía acordarse de registrarse y, si no, su selector salía vacío.

## Consecuencias
- La matriz de permisos crece unas quince filas. La pantalla de perfiles las agrupa por sección para que siga siendo manejable en móvil.
- Una opción devuelve poco (nombre y un dato): no filtra campos sensibles ni valores inactivos.
- Agregar una sección es un recurso, su migración con el permiso a `admin` y, si otro formulario la necesita, `offersOptions` en su definición.
- Una lista ofrece su ruta `/options` cuando un formulario la necesita, no antes: hoy `areas` y `unit_categories` (`offersOptions` en `ParameterCatalog`). Las demás la reciben con su primer formulario, sin tocar permisos.
