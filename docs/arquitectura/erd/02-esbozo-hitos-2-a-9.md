# ERD — esbozo de los hitos 2 a 9

Solo entidades y relaciones clave. **Las columnas, tipos e índices de cada hito se detallan al planearlo** (plan del hito, aprobación y luego migraciones), con las convenciones del [README](README.md). El Hito 1 ya está detallado en [01-fundaciones.md](01-fundaciones.md).

## Decisiones ya tomadas que el detalle debe respetar

- **Identificadores:** UUID v7 en todas las tablas ([ADR-0015](../../adr/0015-identificadores-uuid.md)). Catálogos en una tabla por parámetro, con un CRUD genérico en el código ([ADR-0016](../../adr/0016-catalogos-y-configuracion-tipados.md)).
- **Productos:** no se guarda ningún precio; se calcula desde el costo (con IVA), el nivel de margen, el IVA y el ISR (ADR-0011). El área del producto sale de su grupo, no se repite en el producto.
- **Margen (MCP):** es el nivel que se aplica al producto al venderlo a un cliente. El proveedor no tiene margen.
- **Paquetes:** un ítem aparte, compuesto solo de productos simples, sin descuento propio (P17) ni paquetes anidados (P18).
- **Clientes:** un solo registro que nace como prospecto y pasa a cliente de venta; los datos fiscales y de crédito van en una tabla 1 a 1 que solo existe para clientes de venta.
- **Identificación de clientes y proveedores:** tipo `nit`, `cui` o `none` (economía informal), elegido en el UI. La misma identificación no se repite entre activos. NIT con el dígito verificador módulo 11 de la SAT (`576937-K` válido, `8977112-0` inválido; falta confirmarla con NIT reales); la regla del CUI se define al implementarla. Un cliente sin identificación es real y se factura como consumidor final: no hay un cliente «consumidor final» genérico.
- **Contactos:** personas independientes, vinculadas a clientes y a proveedores con un rol (tipo de contacto). Direcciones múltiples para clientes y proveedores.
- **Cierre de Hito 1:** las migraciones del Hito 2 crean las llaves foráneas que el Hito 1 dejó pendientes (`users.client_id`, `users.contact_id`, `company_profile.tax_regime_id`).
- **Campos del legacy:** se revisan cuando exista la interfaz de cada módulo y se agregan con una migración.

## Hito 2 — Catálogo y clientes

| Entidad | Para qué | Relaciones clave |
|---|---|---|
| Catálogos PM1 a PM13 + unidad de medida | Listas administrables, una tabla cada una | Las usan clientes, contactos, proveedores y productos |
| `areas`, `product_groups`, `brands` | Estructura del catálogo | El grupo pertenece a un área |
| `contacts` | Personas | Vinculadas a clientes y proveedores con rol |
| `suppliers` (+ direcciones) | A quién se le compra | Sus productos se desactivan en cascada |
| `products` | Producto simple con costo | Proveedor, grupo, marca, unidad |
| `packages`, `package_items` | Ítem compuesto | Contiene productos simples con cantidad |
| `clients` (+ perfil de facturación, direcciones) | Prospectos y clientes de venta | Vendedor asignado (`users`), contactos con rol |

## Hito 3 — Tareas, tickets y cierre del legacy

| Entidad | Para qué | Relaciones clave |
|---|---|---|
| Estados y transiciones | Motor de estados configurable con banderas semánticas | Lo usan tareas, tickets y, después, cotizaciones y proyectos |
| Entradas del hilo, menciones | Comentarios, cambios de estado y menciones, con bandera interno/externo | Sobre cualquier registro |
| Reglas y notificaciones | Configurables por perfil y departamento; endpoint de actualizaciones | Usuarios, perfiles, departamentos |
| Archivos | Fotos en WebP normal y miniatura, metadatos en JSON | Vinculados a cualquier registro |
| `tasks`, `tickets` | Tareas con vencimiento; tickets mínimos | Usuario asignado, cliente, estado, hilo |
| Mapeo de importación | `legacy_id` y registro de lo importado | Entidades importables |

## Hito 4 — Cotizador

| Entidad | Para qué | Relaciones clave |
|---|---|---|
| `quotes` y versiones | Oferta con validez configurable | Cliente, vendedor, estado, correlativo |
| Líneas de oferta | Copia congelada del precio, nivel de margen, tasas y composición del paquete | Producto **o** paquete, nunca ambos |
| Plantillas de oferta | «Ofertas tipo» | Líneas de plantilla |

## Hito 5 — Proyectos, compras e inventarios

| Entidad | Para qué | Relaciones clave |
|---|---|---|
| Reglas y solicitudes de aprobación | Motor extensible para convertir oferta en proyecto | Oferta, aprobador |
| Plantillas de proyecto (etapas y actividades ponderadas) | Estructura de avance | Generan las etapas del proyecto |
| `projects`, etapas y actividades | Proyecto con avance ponderado; subproyectos (P2) | Oferta, cliente, plantilla |
| Bodegas y movimientos | Saldos y movimientos de inventario | Producto, OC, proyecto |
| Solicitudes de compra y órdenes de compra | Paquetes desglosados; OC por proveedor | Proyecto, proveedor, producto |

## Hito 6 — Facturación y finanzas

| Entidad | Para qué | Relaciones clave |
|---|---|---|
| Facturas | Facturación flexible por etapa; FEL si aplica | Proyecto, etapa, cliente |
| Cobros | CXC con anticipos y cobros parciales | Factura |
| Cuentas por pagar | Antigüedad de saldos por proveedor | OC, proveedor |
| Costo real y rentabilidad | Se calculan, no se guardan | Proyecto, OC, factura |

## Hito 7 — Administración, soporte y reportes

| Entidad | Para qué | Relaciones clave |
|---|---|---|
| Cuentas, movimientos y conciliaciones bancarias | Bancos | Cobros y pagos |
| Empleados y reglas de comisión | RRHH y comisiones con motor configurable | Usuario, proyecto, cobro |
| Equipos, contratos de mantenimiento, SLA | Helpdesk extendido | Cliente, ticket |
| Reuniones y minutas | Proyectos internos | Tareas, usuarios |
| Metas | Indicadores de reportes | Usuario, periodo |

## Hitos 8 y 9 — Móvil y portal

| Entidad | Para qué | Relaciones clave |
|---|---|---|
| Eventos de ubicación | Check-in puntual (P6) | Usuario, dispositivo |
| Chat de proyecto | Por registro (P22), sobre el hilo | Proyecto |
| Portal | Sin tablas nuevas previstas: usa usuarios externos, el hilo y las vistas existentes, con el alcance «cliente asignado» | Usuario externo, cliente |

## Preguntas abiertas que afectan a estos hitos

| Pregunta | Supuesto | Hito |
|---|---|---|
| P3 Estados reales del cliente | Catálogo sin valores fijos | 2 |
| P17 / P18 Descuento y anidación de paquetes | Sin descuento y sin anidados | 2 |
| Regla del CUI y misma persona con NIT y CUI | Se define al implementar; se avisa si hay otro registro con el mismo nombre | 2 |
| Facturar a un cliente sin identificación | Como consumidor final | 6 |
| P2 Proyectos consolidados | Un proyecto puede tener subproyectos | 5 |
| P4 Momento de la OC | Cuando Compras procesa la solicitud | 5 |
| P1 FEL | Columna de moneda; FEL en facturación | 6 |
| P23 / P7 Esquema y datos del legacy | Campos que falten se agregan con una migración | 3 |
