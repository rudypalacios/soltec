# ADR-0024: Permisos por sección y listas de opciones

**Estado:** Aceptada · **Fecha:** 2026-10-12

## Contexto
Administrar una sección (ver su lista completa, crear, editar, desactivar) es distinto de usar sus valores en otra. Quien edita productos necesita elegir proveedor, marca y unidad, pero puede no tener derecho a entrar a Proveedores ni a Marcas. Un solo permiso para todo el catálogo no da esa granularidad.

## Decisión
- **Cada sección es su propio recurso de permisos**, con los cuatro permisos de siempre (`view`, `create`, `edit`, `deactivate`): `products`, `bundles`, `brands`, `areas`, `product_groups`, `units_of_measure` (categorías y unidades), `suppliers`, `contacts`, `clients`, y los cinco parámetros `contact_types`, `client_statuses`, `segments`, `tax_regimes` y `payment_methods`.
- **Listas de opciones:** cada recurso que otro necesita ofrece `GET /v1/<recurso>/options`, que devuelve solo `id`, nombre y el dato mínimo para elegir (el `area_id` de un grupo, la categoría de una unidad, el color de un estado) de los valores **activos**. La autoriza el permiso `view` del propio recurso **o `view` de un recurso consumidor** (2026-10-13: antes decía «cualquier permiso» y luego «crear o editar»; quien puede ver una sección puede ver los valores que esa sección usa, aunque no administre su origen. Como toda acción exige `view`, el `view` del consumidor cubre también a quien crea o edita). Las listas de recursos con dueño respetan el alcance: hoy, los posibles dueños de un contacto se calculan con el alcance del llamante sobre `contacts`. La ruta declara las alternativas unidas con `|` (`areas.view|product_groups.view`).
- **Consumidores** (un mapa en el código, no una tabla):

| Opciones de | Las piden |
|---|---|
| `contact_types` | `contacts`, `clients`, `suppliers` |
| `client_statuses`, `segments`, `tax_regimes`, `payment_methods` | `clients` |
| `brands`, `product_groups`, `units_of_measure`, `suppliers` | `products` |
| `unit_categories` | `units_of_measure` |
| `areas` | `product_groups`, `products`, `clients` |
| `products` | `bundles` |

- **La administración sí exige el permiso del propio recurso:** la lista completa, los inactivos y el alta, edición y desactivación. Ver no es crear: quien solo puede ver una sección elige entre las opciones, pero no crea ni edita proveedores, contactos ni marcas desde ella.
- **Recursos de audiencia externa:** un rol externo solo recibe recursos marcados para clientes externos (hoy `client_profile`, ADR-0025). Guardar un rol externo con un recurso interno se rechaza.
- El alcance de datos (`own`, `team`, `all`, `client`) solo aplica a los recursos con dueño: `contacts` y `clients`.

## Alternativas descartadas
- **Un recurso por área funcional** (`catalog` para todo): quien edita productos administraría también marcas y proveedores.
- **Dejar las listas de opciones sin permiso:** cualquier usuario con sesión vería los datos de todas las secciones.
- **Una tabla de «quién consume a quién»:** nadie la edita; es una decisión de código con su prueba.

## Consecuencias
- La matriz de permisos crece unas quince filas. La pantalla de perfiles las agrupa por sección para que siga siendo manejable en móvil.
- Una opción devuelve poco (nombre y un dato): no filtra campos sensibles ni valores inactivos.
- Agregar una sección es un recurso, su migración con el permiso a `admin` y una línea en el mapa de consumidores.
- Una lista ofrece su ruta `/options` cuando tiene un consumidor, no antes: hoy `areas` y `unit_categories` (`optionConsumers` en `ParameterCatalog`). Las demás la reciben con su primer formulario.
