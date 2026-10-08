# DOCUMENTO DE LEVANTAMIENTO DE REQUERIMIENTOS
# Sistema CRM-ERP Integral

**Versión:** 1.2
**Fecha:** Octubre 2026
**Estado:** Base funcional para iniciar el desarrollo. Las decisiones tomadas están en la sección 3.6 y 3.2. Todo lo no definido está catalogado en la sección 7 como **pregunta abierta**, con un supuesto provisional y el hito que bloquea. Ninguna pregunta abierta bloquea el arranque (Hitos 0 a 3).

---

## ÍNDICE

1. Visión General del Sistema
2. Módulos Principales
3. Requerimientos No Funcionales
4. Reglas de Negocio Críticas
5. Casos de Uso Principales
6. Pantallas Principales por Rol
7. Preguntas Abiertas y Próximos Pasos
8. Hitos de Implementación
9. Glosario de Términos
10. Control de Versiones
- Anexo A. Propuestas por confirmar (rescatadas del borrador anterior)

---

## 1. VISIÓN GENERAL DEL SISTEMA

El sistema es una solución integral CRM-ERP que unifica la gestión comercial, operativa y administrativa de la empresa, organizándose en módulos interconectados que cubren desde la prospección hasta la post-venta y administración financiera.

### 1.1 Arquitectura Funcional
- **Core Ventas:** Administración, Cotizador, Gestión de clientes y proveedores
- **Administración:** Ingresos, egresos, sueldos, contabilidad
- **Operación:** Asignación de recursos, control de costos, gestión de proyectos
- **Móvil:** Dashboards, tareas, notificaciones, geolocalización
- **Portal Cliente Externo:** Consulta de proyectos, facturación y comunicación

### 1.2 Objetivo del Sistema
Ofrecer trazabilidad completa del ciclo de negocio: **Prospección → Cotización → Proyecto → Compras → Facturación → Cobro**, con visibilidad diferenciada por rol de usuario y sincronización entre operación de campo (móvil) y administración central.

---

## 2. MÓDULOS PRINCIPALES

### 2.1 GESTIÓN DE CONTACTOS Y CLIENTES

#### 2.1.1 Parámetros del Sistema (Catálogos configurables)
| Código | Parámetro |
|--------|-----------|
| PM1 | Tipo de contacto |
| PM2 | Estado de cliente |
| PM3 | Cadencia de contacto |
| PM4 | Tipo de cliente (A-B-C) |
| PM5 | Segmentos |
| PM6 | Régimen Fiscal |
| PM7 | Formas de pago |
| PM8 | Cadencia de Actualización |
| PM9 | Área (portafolio interno) |
| PM10 | MCP (Margen Productos) |
| PM11 | Marca |
| PM12 | Grupo |
| PM13 | Tipo/Puesto |

**Todos los parámetros son administrables mediante CRUD estándar** (crear, editar, archivar/desactivar — no eliminación física, ver 4.2). Se precargan con los siguientes valores iniciales, ampliables por el administrador:

| Parámetro | Valores iniciales precargados |
|-----------|-------------------------------|
| PM1 - Tipo de contacto | Comercial, Compras, Facturación |
| PM5 - Segmentos | Restaurantes, Industria Manufacturera, Departamentos/Interiorismo, Construcción, Finanzas, Educación, Servicios, Retail |
| PM9 - Área (portafolio interno) | Aire Acondicionado, Electricidad, Cableado, Equipo, Otros |

#### 2.1.2 Contactos (CT1)
- Código único automático
- Nombre, teléfono, móvil, email
- Dirección, zona, país
- Múltiples contactos por cliente, cada uno con rol específico (venta, compras, cobros, etc.)
- Sincronización móvil por usuario específico

#### 2.1.3 Clientes (CT2)

**Clientes en Prospección:**
- Creados por usuarios de perfil ventas
- Uso y administración exclusiva del vendedor creador/asignado
- Widget de creación rápida disponible en el dashboard del vendedor
- Reasignables a otro vendedor (ej. por salida de personal de la empresa)
- Campos: Nombre empresa, contacto, dirección, teléfono, móvil, email, área

**Clientes de Venta:**
- Datos completos para facturación (nombre comercial, fiscal, NIT, régimen fiscal)
- Términos de crédito, historial de ventas
- Múltiples contactos con roles específicos
- Estado del cliente: ⏳ **por confirmar (P3)**. El borrador anterior listaba "abierto/cerrado/perdido/cancelado", que parecen estados heredados de proyectos. Mientras tanto, el estado es un catálogo configurable (PM2) sin valores fijos (ver 4.4)
- Tickets de soporte y contratos de mantenimiento relacionados
- **Conversión automática** de prospecto a cliente de venta al aprobarse la primera cotización
- Validación de NIT duplicado al momento de creación/conversión

#### 2.1.4 Proveedores (CT3)
- Código único automático
- Nombre comercial, razón social, NIT, régimen fiscal
- Direcciones y contactos múltiples con roles
- Términos de crédito, historial de compras
- Solo desactivación, no eliminación física (ver sección 4.2)
- **Cascada al desactivar:** los productos asociados a ese proveedor se desactivan automáticamente. En ofertas/cotizaciones ya cerradas, los productos permanecen visibles (histórico intacto). Si el producto desactivado forma parte de una oferta/cotización **activa**, el sistema notifica al responsable para que lo reemplace antes de continuar (ver 4.2)

### 2.2 GESTIÓN DE PRODUCTOS E INVENTARIOS

#### 2.2.1 Productos (CT4)
- Código único automático
- Proveedor, área, grupo, marca, descripción
- Costo, unidad de medida (UFDM)
- **MCP configurable por proveedor** (dropdown, porcentaje mayor o menor según proveedor)
- Precios sin IVA y con IVA calculados automáticamente
- Última fecha de modificación de precio
- Checkbox para autorizar creación sin existencia en inventario

#### 2.2.2 Listado de Precios
- Menús con permisos granulares por usuario (editar, crear, eliminar/desactivar por sub-módulo: proveedor, grupo, marca, área, variables, bodega)
- Variables globales del sistema (ej. IVA 12%, ISR 5%)
- **Ítems compuestos:** agrupación de varios ítems con precio individual; actualización automática del precio del combo cuando cambia un componente
- Visualización completa con filtros y búsqueda
- Alertas visuales de precios desactualizados según parámetro de tiempo configurable

#### 2.2.3 Inventarios
- Creación de múltiples bodegas (nombre, código, bodega predeterminada)
- Control de ingresos/egresos con saldo inicial, ingresos, egresos, saldo final
- Relación con órdenes de compra y número de proyecto
- Ítems sin stock: **se pueden cotizar**, mostrando alerta visible de "sin existencia — validar disponibilidad"

### 2.3 SISTEMA DE COTIZACIONES Y VENTAS

#### 2.3.1 Cotizador
- Correlativo automático configurable
- Cliente limitado a cartera asignada al vendedor
- Datos automáticos: dirección, contacto, mail, teléfono

**Modalidades:**
1. **Nueva oferta:** selección múltiple desde listado de precios; pantalla dividida (catálogo arriba / selección abajo); margen ajustable por ítem
2. **Formato automático:** uso de plantillas ("ofertas tipo") reutilizables sin alterar el formato fuente; o creación de nuevas plantillas

**Reglas clave:**
- Ítems de mano de obra: tipo estándar (catálogo) o libre (precio a discreción del vendedor)
- Precio histórico conservado: actualizaciones de costo NO afectan cotizaciones ya emitidas
- Combos: si un componente cambia de precio, el combo se actualiza automáticamente, salvo que esté dentro de una cotización vigente (se mantiene fijo)
- Publicación en PDF descargable (no se almacena el archivo, sí el registro/datos). Formato propuesto en Anexo A.2
- Aceptación de cotización: **manual**, marcada por el vendedor
- Visualización en dashboards jerárquicos según permisos

#### 2.3.2 Estados de Cotización
- Estados base: **Borrador → Enviada → Seguimiento → Congelada → Cancelada → Completada**
- Sistema debe permitir **crear nuevos estados** configurables
- Los nuevos estados solo aplican a cotizaciones futuras; las cotizaciones existentes no se modifican retroactivamente

#### 2.3.3 Gestión de Proyectos
**Conversión Oferta → Proyecto:**
- Iniciada por el vendedor. Por defecto es **automática**, sin aprobación bloqueante
- **Aprobación bloqueante condicional:** se activa y requiere confirmación de **gerencia de ventas o administración** (basta la aprobación de uno de los dos) cuando se cumple cualquiera de estos criterios configurables:
  - Monto de la oferta supera un umbral configurable
  - Cliente nuevo (primera conversión prospecto → cliente)
  - Anticipo menor a un % configurable
  - Vendedor sin autonomía plena (perfil junior)
  - *(Requerimiento no funcional: el motor de criterios debe ser extensible a futuro, permitiendo configurar reglas adicionales con base en cualquier campo del formulario/flujo, no solo los 4 listados)*
- El jefe/supervisor recibe notificación automática en todos los casos, aplique o no aprobación bloqueante
- Número de proyecto único autogenerado
- Un proyecto puede escalar a **múltiples proyectos consolidados**, cada uno con comisiones calculadas de forma independiente (⏳ interpretación por confirmar, P2)
- Datos adicionales al convertir: dirección de entrega, fecha inicio/fin estimada, anticipo (sí/no, %)

**Seguimiento:**
- **Estados base: Pendiente → En Ejecución → Detenido → Finalizado → Entregado**, ampliable con nuevos estados configurables (aplican solo a proyectos futuros, ver 4.4)
- Estructura de avance generada a partir de la plantilla de tipo de proyecto asignada (ver 2.3.4)
- Reportes diarios, fotografías, comentarios históricos
- Facturación flexible: puede emitirse al inicio, en medio o al final del proyecto, según el caso
- Cobranza: vendedor visualiza el seguimiento, sincronizado en tiempo real con administración
- Campos propuestos del proyecto: Anexo A.1

#### 2.3.4 Plantillas de Tipo de Proyecto (Sistema de Control de Avance)
Reemplaza el mecanismo manual de "crear entregables desde cero por proyecto". En su lugar, la estructura de seguimiento se genera a partir de una plantilla reutilizable:

- **Administración de tipos de proyecto:** el administrador crea libremente los tipos de proyecto que la empresa necesite (sin catálogo precargado; ej. "Cableado Estructurado", "A/C Mini Split", etc., según necesidad real del negocio)
- Cada tipo de proyecto define una estructura de **etapas** (ej. Logística, Instalación Pasiva, Instalación Activa, Pruebas, Entrega), y dentro de cada etapa, **actividades** con un % de ponderación asignado
- **Al crear un proyecto:** se selecciona el tipo de proyecto correspondiente y el sistema autogenera automáticamente la estructura de etapas/actividades con sus ponderaciones (equivalen a los antiguos "entregables" y "tareas")
- **Edición de ponderaciones:** los % son editables tanto por el administrador (a nivel de plantilla, afectando proyectos futuros) como por el responsable del proyecto al iniciar (ajuste específico para ese proyecto puntual, sin alterar la plantilla base)
- El % de avance general del proyecto se calcula como la suma ponderada del avance de cada actividad completada

### 2.4 SISTEMA DE TAREAS Y SEGUIMIENTO

#### 2.4.1 Tipos de Tareas (AP1)
Ventas, compras, administrativa, mantenimiento, emergencia, proyecto, cobro, pago, servicios

#### 2.4.2 Flujo de Estados
Asignada → Aceptada → En ejecución → Completada → Cerrada
(con posibilidad de Rechazada, solicitando cambio de deadline)

- Notificaciones automáticas configurables por rol/área
- Histórico completo de comentarios por tarea

### 2.5 SISTEMA DE COMPRAS

**Tipos de compra:**
1. Relacionadas a proyecto (control de costo máximo por venta)
2. Administrativas / operación del negocio (costos fijos)
3. Inventario sin venta relacionada

**Flujo:**
- Solicitud de compra basada en materiales de la oferta aprobada (combos desglosados completos, no simplificados)
- Comparación automática: cantidad en bodega vs. cantidad ofertada vs. cantidad a solicitar
- Botones: Guardar (data pendiente de procesar) y Procesar (notifica a compras)
- Compras puede ajustar cantidades y proveedor final (por mejor precio de mercado)
- Ítems con cantidad solicitada "0" no afectan el costo del proyecto
- Costo final de proyecto = costo del ítem con OC asociada (no necesariamente el ofertado)
- **Generación automática de orden de compra (OC)** en PDF por proveedor, con numeración única y referencia a proyecto cuando la compra es de tipo proyecto (⏳ momento exacto de generación por confirmar, P4)

### 2.6 MÓDULOS ADMINISTRATIVOS

#### 2.6.1 Facturación
- Vinculada a datos fiscales del cliente y al proyecto
- Emisión flexible según etapa del proyecto
- Precios con/sin IVA

#### 2.6.2 Cuentas por Cobrar (CXC)
- Dashboard de cobros del día, vencidos y próximos (rango de días configurable)
- Gestión de anticipos vs. cobro total; cobros parciales con nueva fecha de compromiso
- Múltiples cuentas bancarias para depósito
- Eliminación restringida por permisos (solo desactivación)
- Búsqueda en histórico de cobros

#### 2.6.3 Cuentas por Pagar (CXP)
- Seguimiento por proveedor, antigüedad de saldos
- Integración con órdenes de compra

#### 2.6.4 Bancos y Conciliación
- Múltiples cuentas, saldo inicial configurable
- Conciliación bancaria e indicadores financieros

#### 2.6.5 Recursos Humanos
- Control de empleados, prestaciones, comisiones (fórmula pendiente, ver P10)
- Constancias laborales

### 2.7 MÓDULOS DE SOPORTE

#### 2.7.1 Helpdesk (AP4)
No. ticket, cliente, tipo de equipo, equipo relacionado, dueño, asignado, descripción, fecha/hora, estado; histórico de comentarios, reportes de servicio, fotografías, tareas relacionadas

#### 2.7.2 Mantenimiento (AP3)
Gestión de equipos vendidos, contratos de mantenimiento, programación de servicios

> ⏳ **Pendiente (P13):** la fuente original menciona un concepto de "Cliente de convenio" (CRUD propio) además de los contratos de mantenimiento estándar. No se ha confirmado si es un tipo distinto de cliente con condiciones especiales o un sinónimo de "cliente con contrato activo".

#### 2.7.3 Sala de Reuniones (Proyectos internos y Minutas)
- Roles: Master, Creador, Participante, Administrador
- Proyectos internos: entregables ponderados → tareas por entregable → asignación
- Minutas: creación → participantes → tareas derivadas, estado activa/inactiva

### 2.8 FUNCIONALIDADES MÓVILES (PWA — Android e iOS)
- Dashboard con tareas, notificaciones, citas, historial de cliente, indicadores CXC/CXP
- **Funcionamiento offline con sincronización posterior**
- Cierre de tareas remoto, control de visitas, geolocalización, chat de proyecto
- ⏳ Alcance de geolocalización (check-in puntual vs. rastreo continuo) por confirmar, P6

### 2.9 PORTAL DE CLIENTE EXTERNO
- Visualización de sus propios proyectos activos y progreso
- Estado de facturación y pagos
- Progreso reportado en tiempo real
- Módulo de comunicación tipo JIRA (comentarios, documentos, actualizaciones) por proyecto
- Notificaciones de cambios relevantes en sus proyectos
- Acceso restringido exclusivamente a su propia información

### 2.10 REPORTES E INDICADORES
- Rotación de inventario, variación de precios
- Ventas por cliente / persona / área
- Compras por proveedor, pipeline general e individual
- Cobros (diario/mensual/anual), antigüedad de saldos CXC/CXP
- Márgenes por venta, estados de resultados y balances
- Metas globales e individuales, control de comisiones, visitas y ofertas
- **Definición de reportes prioritarios: pendiente (P11)**

### 2.11 AGENDA ⏳ (módulo pendiente de definición, P12)
Aparece como ítem de menú de primer nivel en la documentación fuente, sin desglose funcional. Única pista: en el mapa de módulos original figura como "Calendario de gestión asistida" dentro de CRM > Prospección, junto a Control de visitas, Control de ofertas y Control de ventas, lo que sugiere un calendario de gestión comercial más que un calendario genérico de tareas. **Fuera del alcance hasta que se defina.**

---

## 3. REQUERIMIENTOS NO FUNCIONALES

### 3.1 Rendimiento y Escalabilidad
- **Usuarios concurrentes:** 100+
- **Volumen de datos:** 1,000+ registros (clientes/proyectos/productos) con crecimiento sostenido
- **Tiempo de respuesta:** ≤ 1 segundo para operaciones normales
- **Infraestructura:** Servidor propio en fase inicial, con capacidad de escalar a hosting compartido (Dreamhost, Orange Host) o a la nube según crecimiento

### 3.2 Arquitectura Técnica
- **Backend:** PHP con framework SLIM (API RESTful, API-first: web, PWA y una eventual app nativa son clientes de la misma API)
- **Frontend:** React (TypeScript), pensado desktop-first
- **Base de datos:** Motor relacional estándar (MySQL/PostgreSQL), compatible con hosting compartido (motor definitivo: P15)
- **Migraciones:** esquema versionado con una herramienta de migraciones (p. ej. Phinx), de modo que los cambios de modelo posteriores sean baratos
- **Móvil:** Progressive Web App (PWA), soporte offline con sincronización posterior, Android e iOS
- **Criterio guía:** flexibilidad de despliegue (servidor propio → hosting compartido → nube) sin dependencias propietarias
- **Preparación para app nativa:** ver decisiones de arquitectura en el plan de desarrollo (paquete `shared/`, contrato OpenAPI, adaptadores de dispositivo, protocolo de sync definido en servidor desde el inicio)

### 3.3 Seguridad y Compliance
- **Tipos de usuario:** Empleados internos + Clientes externos (portal diferenciado)
- **Datos sensibles identificados:** NIT, direcciones, teléfonos, información contable/financiera
- **Nivel de protección:** Estándar general, reforzado en el área contable
- **Autenticación:** 2FA opcional (recomendado, no obligatorio en v1); tokens (JWT con refresh revocable por dispositivo)
- **Política de contraseñas:** Expiración cada 3 meses, configurable
- **Auditoría:** Log completo de acciones (usuario, acción, timestamp)
- **Integridad de datos:** Ningún registro se elimina físicamente; todo se desactiva (ver 4.2)

### 3.4 Backup y Recuperación
- Frecuencia de backup configurable por administrador (diario/semanal/etc.)
- Capacidad de restauración granular desde cualquier punto de backup disponible

### 3.5 Integraciones (fase futura, no bloqueantes para v1)
- Sistema contable externo: a evaluar
- Email marketing/CRM externo: posible, no prioritario
- Conciliación bancaria automática: deseable
- Facturación electrónica según normativa local: figura como "deseable", pero **puede ser obligatoria según el país (P1)**; si lo es, pasa a requisito del Hito 5

### 3.6 Modelo de Despliegue (decisión tomada)
- **Una instancia por empresa.** El sistema se diseña para una sola empresa; no hay multiempresa ni multi-tenant en el modelo de datos.
- Si otra empresa quiere usar el sistema, se despliega una **instancia independiente** (subdominio y base de datos propios) con el mismo código base.
- Los datos propios de la empresa (nombre, datos fiscales, logo, moneda, correlativos) viven en una **tabla de configuración**, nunca incrustados en el código, para que replicar una instancia sea configuración y no desarrollo.
- Las migraciones deben poder aplicarse de forma automatizada a todas las instancias.
- **Consecuencia aceptada:** no habrá vistas consolidadas entre empresas distintas. Si se necesitan en el futuro, se resolverían con una capa aparte.
- **Ventajas:** aislamiento total de datos entre clientes, backup y restauración por instancia (cumple 3.4 sin diseño adicional) y modelo de datos y reglas de negocio más simples.

---

## 4. REGLAS DE NEGOCIO CRÍTICAS

### 4.1 Gestión de Clientes y Vendedores
- El vendedor asignado tiene responsabilidad total sobre la relación, información y administración del cliente
- Reasignación de cartera permitida (ej. salida de un vendedor de la empresa)
- Conversión prospecto → cliente de venta es **automática** al aprobarse la primera cotización

### 4.2 Integridad de Datos
- **Regla general: nada se elimina, todo se desactiva.** Aplica a clientes, proveedores, productos, cotizaciones, proyectos, etc.
- Las interfaces deben mostrar por defecto solo registros activos, con opción de ver inactivos/históricos

### 4.3 Precios e Inventario
- Actualización de costos **no afecta** cotizaciones ya emitidas (se conserva el precio histórico)
- Ítems compuestos (combos): actualización automática de precio ante cambio de un componente, excepto dentro de cotizaciones vigentes (precio fijo)
- Venta sin stock: permitida, con alerta visible de "sin existencia — validar disponibilidad"

### 4.4 Estados Configurables
- Cotizaciones y proyectos parten de un set base de estados, pero el sistema debe permitir **crear nuevos estados**
- Los nuevos estados aplican únicamente a registros futuros; los registros existentes no son editables retroactivamente en ese sentido

### 4.5 Control de Cambios de Estado en Proyectos
- El vendedor puede cerrar/cambiar el estado de sus propios proyectos
- El jefe/supervisor **debe ser notificado automáticamente** ante cualquier cambio de estado

### 4.6 Estructura de Proyectos
- Numeración única autogenerada por proyecto
- Un proyecto puede escalar a múltiples proyectos consolidados, cada uno con comisión calculada de forma independiente (P2)
- La estructura de avance (etapas/actividades ponderadas) se genera desde la plantilla de tipo de proyecto seleccionada al crearlo (ver 2.3.4); no se crea manualmente desde cero

### 4.6.1 Aprobación de Conversión Oferta → Proyecto
- Regla por defecto: automática, sin bloqueo
- Se vuelve bloqueante (requiere aprobación de gerencia de ventas **o** administración) si se cumple alguno de los criterios configurables definidos en 2.3.3
- El motor de criterios debe diseñarse extensible para futuras reglas adicionales

### 4.7 Notificaciones
- Sistema de notificaciones **configurable por área y rol** (cada rol define qué tipo de notificación recibe)

### 4.8 Widgets y Dashboard
- Dashboard único como pantalla base para todos los usuarios
- **Widgets configurables según el rol del usuario** (vendedor, jefe de bodega, contabilidad, gerencia, etc.)
- Widget de creación rápida de cliente disponible para vendedores

---

## 5. CASOS DE USO PRINCIPALES

### CU001 — Proceso completo de venta
1. Vendedor crea cliente prospecto (módulo Clientes o widget de creación rápida en dashboard)
2. Vendedor genera cotización sin necesidad de aprobación previa del prospecto
3. Cliente acepta → vendedor marca la cotización como "aceptada" manualmente
4. Prospecto se convierte automáticamente en cliente de venta
5. Vendedor convierte la cotización en proyecto (automático por defecto; requiere aprobación de gerencia de ventas o administración solo si se cumple algún criterio configurable — monto alto, cliente nuevo, anticipo bajo, vendedor junior); el jefe recibe notificación automática en todos los casos; el sistema genera la estructura de avance a partir de la plantilla de tipo de proyecto seleccionada
6. Se genera la solicitud de compra a partir de los materiales de la oferta aprobada; al procesarla Compras, el sistema genera las órdenes de compra por proveedor (ver 2.5; momento exacto por confirmar, P4)
7. Facturación se emite en el momento que corresponda (inicio/medio/fin del proyecto)
8. Cobranza: vendedor da seguimiento, sincronizado con administración en tiempo real

### CU002 — Gestión de inventario y compras
1. Solicitud de compra generada desde proyecto (materiales de la oferta) o desde necesidad de bodega
2. Comparación automática de cantidades (bodega vs. ofertado vs. solicitado)
3. Departamento de compras ajusta proveedor/cantidad según mejor precio
4. Generación de OC en PDF por proveedor
5. Actualización de precios en sistema para futuras ofertas (no afecta cotizaciones vigentes)

### CU003 — Portal de cliente externo
1. Cliente accede a su portal con credenciales propias
2. Visualiza proyectos activos, progreso y facturación
3. Interactúa vía módulo de comunicación tipo JIRA (comentarios, documentos)
4. Recibe notificaciones de cambios relevantes

### CU004 — Gestión de tareas
1. Tarea creada y asignada (dueño distinto de asignado)
2. Asignado acepta o rechaza (solicitando cambio de deadline)
3. Flujo: En ejecución → Completada → Cerrada (por el dueño)
4. Notificaciones automáticas en cada cambio relevante, según configuración de rol

---

## 6. PANTALLAS PRINCIPALES POR ROL (para wireframes)

| Rol | Pantallas / Widgets prioritarios |
|-----|-----------------------------------|
| Vendedor | Dashboard (proyectos activos, cotizaciones pendientes, cobranza), widget de creación rápida de cliente, cotizador |
| Jefe de bodega | Órdenes de compra, inventarios, movimientos de bodega |
| Contabilidad | Cobranza (CXC), facturación, CXP, conciliación bancaria |
| Gerencia | Indicadores generales, acceso a todos los módulos, dashboards jerárquicos |
| Cliente externo | Portal: proyectos, facturación, progreso, comunicación tipo JIRA |

**Nota:** el dashboard es una pantalla única para todos los roles, pero con **widgets configurables** según el perfil del usuario. La lista definitiva de roles está en P5; mientras tanto los roles se modelan como datos configurables, no como código.

---

## 7. PREGUNTAS ABIERTAS Y PRÓXIMOS PASOS

### 7.1 Preguntas abiertas
Ninguna de estas preguntas tiene respuesta todavía. Cada una tiene un **supuesto provisional** para poder avanzar y un **hito antes del cual debe confirmarse**. Si la respuesta difiere del supuesto, se corrige con una migración de esquema.

| # | Pregunta | Supuesto provisional | Confirmar antes de |
|---|----------|----------------------|--------------------|
| P1 | ¿País de operación, moneda(s) y obligatoriedad de facturación electrónica? El IVA 12% y el NIT apuntan a Guatemala, donde la facturación electrónica (FEL, vía certificador autorizado) es obligatoria por ley. | Guatemala, moneda GTQ, con columna de moneda en los documentos monetarios. FEL pasa a requisito de Facturación. | Moneda: Hito 3 · FEL: Hito 5 |
| P2 | "Proyectos consolidados" (4.6): ¿un proyecto se divide en varios con comisión independiente, o varios proyectos se agrupan en uno consolidado? | Un proyecto puede tener sub-proyectos, cada uno con su comisión. | Hito 4 |
| P3 | ¿Qué estados reales tiene un cliente de venta (2.1.3)? ¿Los de "abierto/cerrado/perdido/cancelado" son estados de cliente o un residuo de los estados de proyecto? | PM2 es un catálogo configurable sin valores fijos. | Cierre del Hito 2 |
| P4 | ¿Cuándo se generan las OC: al convertir la oferta en proyecto (CU001 original) o cuando Compras procesa la solicitud (2.5)? | Cuando Compras procesa la solicitud. | Hito 4 |
| P5 | Lista definitiva de roles. | Vendedor (junior/senior), Gerente de ventas, Administración, Contabilidad, Compras, Jefe de bodega, Técnico de campo, Gerencia, Cliente externo; roles y permisos como datos configurables. | Cierre del Hito 1 (no bloquea el esquema) |
| P6 | Geolocalización: ¿check-in puntual o rastreo continuo durante la jornada? ¿El equipo de campo usa Android, iPhone o ambos? | Check-in puntual, PWA. | Hito 7 |
| P7 | ¿Hay datos existentes (hojas de cálculo, sistemas previos) que migrar? ¿Cuáles? | Arranque sin datos históricos. | Antes de producción |
| P8 | Fórmula de rentabilidad por proyecto: ¿solo materiales o también mano de obra y gastos indirectos? | Venta − (costo real de OC + mano de obra + gastos directos); indirectos fuera de v1. | Hito 5 |
| P9 | Definición de CM, UOP, UAI y UN, y si ya se usan en el negocio. | Contribución marginal, utilidad operativa, utilidad antes de impuestos y utilidad neta (interpretación no confirmada). | Hito 6 |
| P10 | Fórmula de comisiones: base (venta, cobro o margen), porcentajes y si varían por producto/área/vendedor. | Motor configurable; fórmula provisional por porcentaje fijo sobre cobro. | Hito 6 |
| P11 | Los 3 a 5 reportes de mayor uso diario/semanal. | Pipeline, cobranza (CXC) y ventas por vendedor. | Hito 6 |
| P12 | Alcance del módulo Agenda. | Fuera de alcance hasta definirse. | Hito 7 |
| P13 | ¿Qué es "Cliente de convenio"? ¿Tipo de cliente distinto o sinónimo de cliente con contrato de mantenimiento activo? | Sinónimo de cliente con contrato activo; sin entidad propia. | Hito 6 (Mantenimiento) |
| P14 | ¿Aplica alguna ley local de protección de datos? | Buenas prácticas estándar (acceso restringido, auditoría, cifrado de datos contables). | Antes de producción |
| P15 | Motor de base de datos: MySQL o PostgreSQL. | MySQL, por compatibilidad con hosting compartido; la instancia por empresa elimina la necesidad de aislamiento por fila. | Hito 0 (antes del ERD) |
| P16 | ¿Se adoptan las propuestas del Anexo A (campos de proyecto, formato de PDF, estados de compra, canales de notificación, control de horarios)? | Se adoptan A.1 a A.5 como punto de partida; A.6 queda opcional. | Hito donde aplique cada una |

### 7.2 Próximos pasos
| Tema | Estado | Notas |
|------|--------|-------|
| Mapa de módulos y matriz de dependencias | Próximo paso | Validar el orden de los hitos |
| Modelo de datos técnico (ERD) | Próximo paso | Tipos de dato y cardinalidades; debe incluir los campos de sync (UUID, versión) |
| Estructura del repositorio | Próximo paso | Monorepo `api/`, `web/`, `mobile/`, `shared/` |
| Especificación de API (OpenAPI) | Próximo paso | Contratos REST por módulo |
| Esqueleto de autenticación y roles | Próximo paso | Roles como datos, JWT con refresh |
| Wireframes/mockups visuales | Próximo paso | Pantallas de la sección 6 |
| Criterios de aceptación (Given-When-Then) | Próximo paso | Por funcionalidad, para QA y desarrollo |

---

## 8. HITOS DE IMPLEMENTACIÓN

0. **Hito 0 — Planeación:** mapa de módulos y dependencias, ERD, estructura del repo, especificación de API, esqueleto de auth y roles. Sin código de funcionalidades.
1. **Hito 1 — Fundaciones:** usuarios, roles y permisos, auditoría, desactivación lógica, parámetros PM y configuración de la empresa, notificaciones y tareas básicas, dashboard base con widgets por rol.
2. **Hito 2 — Núcleo comercial:** contactos, clientes y prospectos (conversión, validación de NIT), proveedores (cascada de desactivación), productos y listado de precios (combos, variables).
3. **Hito 3 — Cotizador:** nueva oferta, plantillas, estados configurables, PDF, conversión prospecto → cliente al aceptar.
4. **Hito 4 — Proyectos, compras e inventarios:** plantillas de tipo de proyecto, conversión oferta → proyecto con motor de aprobación, seguimiento; solicitud de compra y OC en PDF; bodegas y movimientos.
5. **Hito 5 — Facturación y finanzas:** facturación (incluida FEL si aplica), CXC, CXP, costo real por proyecto.
6. **Hito 6 — Administración, soporte y reportes:** bancos y conciliación, RRHH y comisiones, reportes, helpdesk, mantenimiento, sala de reuniones.
7. **Hito 7 — Móvil (PWA):** dashboard móvil, offline con sincronización, geolocalización, chat de proyecto.
8. **Hito 8 — Portal de cliente externo** (tipo JIRA).

Diferencia con el borrador anterior: inventarios pasan del primer bloque al Hito 4, porque se puede cotizar sin stock y solo se necesitan junto con compras. Tareas y notificaciones se adelantan al Hito 1 porque casi todos los módulos las usan.

---

## 9. GLOSARIO DE TÉRMINOS

- **MCP:** Margen de Costo de Productos — configurable por proveedor mediante dropdown, define el porcentaje de margen aplicado
- **CM, UOP, UAI, UN:** Indicadores financieros mencionados en la documentación original — definición exacta pendiente (P9)
- **UFDM:** Unidad de Medida del producto
- **Cadencia:** Frecuencia definida de seguimiento a un contacto/cliente
- **Pipeline:** Embudo de ventas — conjunto de oportunidades en proceso
- **Ítem compuesto / Combo:** Agrupación de varios productos individuales vendidos como una sola unidad con precio propio
- **PWA:** Progressive Web App — aplicación web con capacidades de app nativa (offline, notificaciones)
- **FEL:** Factura Electrónica en Línea, régimen de facturación electrónica de Guatemala

---

## 10. CONTROL DE VERSIONES DEL DOCUMENTO

| Versión | Fecha | Descripción |
|---------|-------|--------------|
| 1.0 | Agosto 2026 | Documento consolidado a partir de V2.pdf y CRM-ERP.pdf, más sesiones de definición de requerimientos no funcionales, reglas de negocio, casos de uso y especificaciones técnicas |
| 1.1 | Agosto 2026 | Validación cruzada contra CRM-ERP_2020.xlsx, FASE_2_Sistema_de_control.xlsx y ERP_2020_v2_Avances.pdf. Plantillas de tipo de proyecto, estados de proyecto corregidos, aprobación bloqueante condicional, valores iniciales de catálogos, cascada de proveedores, Agenda y "Cliente de convenio" como pendientes |
| 1.2 | Octubre 2026 | (1) Se elimina el borrador anterior duplicado que seguía a la v1.1 y contradecía sus reglas; (2) sección 7 reestructurada como preguntas abiertas con supuesto provisional y hito que las bloquea; (3) decisión de despliegue: una instancia por empresa, sin multiempresa (3.6); (4) arquitectura preparada para app nativa y migraciones versionadas (3.2); (5) fases reemplazadas por hitos, con inventarios movidos al Hito 4 y tareas/notificaciones adelantadas al Hito 1; (6) inconsistencias señaladas: estados de cliente (P3), momento de generación de OC (P4), proyectos consolidados (P2); (7) Anexo A con propuestas rescatadas del borrador anterior; (8) referencias e índice corregidos |

---

## ANEXO A. PROPUESTAS POR CONFIRMAR (rescatadas del borrador anterior)

Información útil que estaba solo en el borrador eliminado y que la v1.1 no contenía. No son requerimientos firmes hasta confirmarse (P16).

### A.1 Campos del Proyecto (AP2)
No. de proyecto (único automático), No. de oferta (referencia), cliente, contacto, área, monto, rentabilidad (cálculo por productos y por mano de obra), control de pagos y porcentajes, días ejecutados vs. días estimados, dirección del proyecto, fecha estimada de finalización, contacto comercial asignado, servicios y mano de obra relacionados.

### A.2 Formato del PDF de cotización
Logo de la empresa arriba a la izquierda; datos del cliente junto al logo; datos del vendedor; correlativo de la oferta arriba a la derecha; tabla de ítems con Código, Área, Grupo, Marca, Producto, Precio sin IVA, Cantidad y Total sin IVA; sumatoria con y sin IVA.

### A.3 Formato de la Orden de Compra
Numeración única por solicitud, correlativo propio de OC, agrupación automática por proveedor y referencia al proyecto (obligatoria solo en compras de tipo proyecto; las administrativas y de inventario no tienen proyecto).

### A.4 Estados propuestos de compras (configurables, igual que 4.4)
- Solicitud de compra: Pendiente → Procesada → Parcial → Completa
- Orden de compra: Emitida → Recibida → Facturada → Pagada

### A.5 Notificaciones
Canales: push, email y SMS. Pendiente definir condiciones de disparo y escalamiento por jerarquía.

### A.6 Control de horarios y accesos (opcional)
Horarios de acceso por usuario y área, autorización temporal fuera de horario, restricciones por módulo según horario.

### A.7 Trazabilidad y seguridad adicionales
Log de cambios de precios (usuario y fecha), histórico de versiones de ofertas, control de accesos por dispositivo y cifrado de datos contables y financieros.
