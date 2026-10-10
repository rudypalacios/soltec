# Glosario español → inglés

Los términos del negocio están en español y el código en inglés. Este glosario fija qué nombre en inglés corresponde a cada término, para que las sesiones y las personas nombren siempre igual. **Todo término nuevo se agrega aquí en el mismo cambio que lo introduce.**

## Reglas

| Dónde | Idioma |
|---|---|
| Textos de la interfaz, rutas de las pantallas de la web, documentación, commits y PR | Español |
| Identificadores, comentarios, mensajes de log, endpoints de la API, base de datos, campos JSON, valores de enumeraciones y códigos de error | Inglés |

- **Endpoints de la API:** en inglés, con el nombre de la tabla en plural y con guiones (`margin_levels` → `/api/v1/margin-levels`). Los que no corresponden a una tabla se nombran por su función (`/api/v1/auth/login`, `/api/v1/me`, `/api/v1/sync`).
- **Rutas de la web** (las pantallas que ve el usuario): en español, en minúsculas y con guiones (`/niveles-de-margen`). La columna «Ruta web» de las tablas las fija.
- **Tablas:** `snake_case` en plural (`margin_levels`). Clave foránea: `<singular>_id` (`client_id`). Booleanos: `is_…` o `has_…`. Fechas y horas: `…_at` (`due_at`). Valores de enumeración: minúsculas en inglés (`prospect`, `customer`).
- **Palabras reservadas de MySQL:** no se usan como nombre. Por eso `product_groups` (no `groups`) y `setting_key` (no `key`).
- Los documentos anteriores a este glosario usan nombres en español para algunas tablas (`dispositivos`, `eventos_ubicacion`, `perfil_usuario`). Manda este glosario; el ERD lo usa.

## Acceso y organización

| Español | Inglés (código y base de datos) | Ruta web |
|---|---|---|
| usuario | `User` · `users` | `/usuarios` |
| usuario interno / externo | `users.type`: `internal` / `external` | |
| perfil (el rol con sus permisos) | `Role` · `roles` | `/perfiles` |
| permiso | `Permission` · `permissions` | `/permisos` |
| recurso (módulo protegido) | `Resource` · `resources` | |
| acciones: ver, crear, editar, desactivar, aprobar | `view`, `create`, `edit`, `deactivate`, `approve` | |
| alcance de datos: propio, equipo, todo, cliente asignado | `own`, `team`, `all`, `client` | |
| departamento | `Department` · `departments` | `/departamentos` |
| jefe directo | `manager_id` | |
| dispositivo | `Device` · `devices` | `/dispositivos` |
| evento de ubicación | `LocationEvent` · `location_events` | |
| token de refresco | `RefreshToken` · `refresh_tokens` | |
| auditoría | `AuditLog` · `audit_logs` | `/auditoria` |
| iniciar sesión | `login` | `/ingresar` |
| cambiar contraseña | `changePassword` | `/cambiar-contrasena` |
| token de acceso (el «pase» de 15 minutos) | `access_token` (JWT) | |
| token restringido (solo sirve para cambiar la contraseña) | claim `scp: password_change` · `x-allows-restricted-token` (contrato) | |
| obligación de cambiar la contraseña (token restringido) | `users.must_change_password` | `/cambiar-contrasena` |
| invitación (el alta sin contraseña; el usuario la elige con un enlace) | `AccountToken` · `account_tokens` (propósito `invitation`) · `users.invitation_pending` (calculado: sin `password_hash`) | `/aceptar-invitacion` |
| recuperar contraseña (solicitar el correo / elegir la nueva) | `account_tokens` (propósito `password_reset`) | `/recuperar-contrasena`, `/restablecer-contrasena` |
| ventana de gracia del refresco (dos pestañas a la vez) | `REFRESH_GRACE_SECONDS` | |
| último administrador (regla que impide quedarse sin ninguno) | `last_admin` (código de error) · `AdminGuard` | |

## Configuración y precios

| Español | Inglés | Ruta web |
|---|---|---|
| configuración general | Tablas de una sola fila por tema (ADR-0016): `financial_settings`, `security_settings`, `mail_settings` | `/configuracion` |
| datos de la empresa | `Company` · `company` (una sola fila) | |
| IVA | `vat_rate` | |
| ISR | `income_tax_rate` | |
| nivel de margen (MC) | `MarginLevel` · `margin_levels` | `/niveles-de-margen` |
| costo (el costo es con IVA) | `cost_with_vat` | |
| precio sin IVA / con IVA | `price_without_vat` / `price_with_vat` | |
| validez de cotización (días) | `quote_validity_days` | |
| días para marcar un costo desactualizado | `stale_cost_days` | |
| correlativo | `Sequence` · `sequences` (recurso `sequences`) | |
| marcador de operación especificada y aún sin ruta | `x-planned` (contrato) | |
| permiso de una operación | `x-permission` (contrato) | |

## Catálogo

| Español | Inglés | Ruta web |
|---|---|---|
| parámetro de catálogo | Una tabla por parámetro, con un CRUD genérico en el código (ADR-0016) | `/parametros` |
| tipo de contacto (PM1) | `contact_types` | |
| estado de cliente (PM2) | `client_statuses` | |
| cadencia de contacto (PM3) | `contact_cadences` | |
| tipo de cliente A-B-C (PM4) | `client_types` | |
| segmento (PM5) | `segments` | |
| régimen fiscal (PM6) | `tax_regimes` | |
| forma de pago (PM7) | `payment_methods` | |
| cadencia de actualización (PM8) | `update_cadences` | |
| puesto (PM13) | `job_titles` | |
| unidad de medida | `units_of_measure` | |
| marca | `Brand` · `brands` | `/marcas` |
| área (línea de producto o servicio) | `Area` · `areas` | `/areas` |
| grupo (subcategoría de un área) | `ProductGroup` · `product_groups` | `/grupos` |
| producto | `Product` · `products` | `/productos` |
| paquete (producto compuesto) | `Bundle` · `bundles` | `/paquetes` |
| componente de un paquete | `BundleItem` · `bundle_items` | |

## Clientes y proveedores

| Español | Inglés | Ruta web |
|---|---|---|
| cliente | `Client` · `clients` | `/clientes` |
| prospecto / cliente de venta | `clients.type`: `prospect` / `customer` | |
| identificación: NIT, CUI o sin identificación | `tax_id_type` (`nit`, `cui`, `none`) y `tax_id` | |
| datos fiscales y de crédito del cliente de venta | `client_billing_profiles` | |
| vendedor asignado | `seller_id` | |
| contacto | `Contact` · `contacts` | `/contactos` |
| proveedor | `Supplier` · `suppliers` | `/proveedores` |

## Tareas, tickets y flujos

| Español | Inglés | Ruta web |
|---|---|---|
| tarea | `Task` · `tasks` | `/tareas` |
| ticket | `Ticket` · `tickets` | `/tickets` |
| fecha de vencimiento | `due_at` | |
| hilo de actividad | `Thread` · `threads` | |
| entrada del hilo (comentario, cambio de estado, mención) | `ThreadEntry` · `thread_entries` | |
| motor de estados | `Workflow` | |
| estado | `WorkflowState` · `workflow_states` | |
| transición | `WorkflowTransition` · `workflow_transitions` | |
| bandera semántica (aceptada, terminal) | `flag` | |
| notificación | `Notification` · `notifications` | `/notificaciones` |
| archivo, foto | `File` · `files` | `/archivos` |
| metadatos (JSON) | `metadata` | |

## Comercial, compras e inventario

| Español | Inglés | Ruta web |
|---|---|---|
| cotización | `Quote` · `quotes` | `/cotizaciones` |
| línea de cotización | `QuoteLine` · `quote_lines` | |
| versión de cotización | `QuoteRevision` · `quote_revisions` | |
| plantilla de cotización (oferta tipo) | `QuoteTemplate` · `quote_templates` | `/plantillas-de-cotizacion` |
| proyecto | `Project` · `projects` | `/proyectos` |
| plantilla de tipo de proyecto | `ProjectTemplate` · `project_templates` | |
| etapa | `Stage` · `stages` | |
| actividad de una etapa | `StageActivity` · `stage_activities` | |
| ponderación / avance | `weight` / `progress` | |
| regla de aprobación | `ApprovalRule` · `approval_rules` | |
| solicitud de compra | `PurchaseRequest` · `purchase_requests` | `/solicitudes-de-compra` |
| orden de compra (OC) | `PurchaseOrder` · `purchase_orders` | `/ordenes-de-compra` |
| bodega | `Warehouse` · `warehouses` | `/bodegas` |
| movimiento de inventario | `StockMovement` · `stock_movements` | |
| existencia | `stock` | |

## Finanzas, administración y móvil

| Español | Inglés | Ruta web |
|---|---|---|
| factura | `Invoice` · `invoices` | `/facturas` |
| cuentas por cobrar / por pagar | `accounts_receivable` / `accounts_payable` | `/cuentas-por-cobrar`, `/cuentas-por-pagar` |
| cuenta bancaria | `BankAccount` · `bank_accounts` | `/cuentas-bancarias` |
| conciliación | `reconciliation` | |
| empleado | `Employee` · `employees` | `/empleados` |
| comisión | `Commission` · `commissions` | `/comisiones` |
| reporte | `Report` | `/reportes` |
| portal de cliente | `client portal` | |
| sincronización | `sync` | |
| clave de idempotencia | `idempotency_key` | |
