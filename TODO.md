# TODO — Sistema CRM-ERP

Lista viva de hitos. Marca `[x]` al terminar y revisar. Cada hito dice explícitamente qué queda **fuera**. Orden y dependencias: `docs/arquitectura/mapa-de-modulos.md`.

## Hito 0 — Planeación
- [x] Resumen de entendimiento, riesgos y contradicciones
- [x] ADR 0001 a 0011 (`docs/adr/`)
- [x] Entregable 1: mapa de módulos y matriz de dependencias (en revisión: PR #2)
- [ ] Entregable 2: ERD (detallado para los hitos 1 a 3, esbozado para el resto; incluye campos de sync)
- [ ] Entregable 3: estructura del repositorio
- [ ] Entregable 4: especificación OpenAPI de los hitos 1 a 3
- [ ] Entregable 5: esqueleto de autenticación y roles
- [ ] Confirmar ADR-0004 (despliegue) y ADR-0006 (OpenAPI), hoy en `Propuesta`

## Hito 1 — Fundaciones
- [ ] Usuarios, perfiles y permisos por módulo, login con JWT y refresh
- [ ] Departamentos, jerarquía (jefe directo), alcance de datos
- [ ] Auditoría y desactivación lógica
- [ ] Configuración general (empresa, IVA, ISR, días de costo, validez de cotización, correlativos, SMTP)
- [ ] Niveles de margen y función de precio, con los casos de prueba del ADR-0011
- [ ] Dashboard base (contenedor y registro de widgets)
- **Fuera:** tareas, notificaciones, parámetros de catálogo, catálogo, clientes.

## Hito 2 — Catálogo y clientes
- [ ] Parámetros de catálogo (precarga PM1 y PM5)
- [ ] Marcas, áreas (precarga PM9) y grupos
- [ ] Contactos y proveedores (cascada de desactivación a productos)
- [ ] Productos simples y paquetes, con alerta de costo desactualizado
- [ ] Clientes (prospecto y venta, NIT sin duplicados)
- **Fuera:** cotizaciones, conversión automática a cliente, aviso a cotizaciones vigentes, inventario y stock.

## Hito 3 — Tareas, tickets y cierre del legacy
- [ ] Motor de estados
- [ ] Hilo de actividad
- [ ] Notificaciones y endpoint de actualizaciones (polling)
- [ ] Archivos y fotos
- [ ] Tareas y tickets mínimos
- [ ] Importación del legacy, prueba paralela y apagado
- **Fuera:** campos extendidos del ticket (equipo, contrato, SLA, prioridad), chat libre, offline.

## Hito 4 — Cotizador
- [ ] Ofertas, plantillas, estados, versiones y PDF
- [ ] Validez y congelamiento de precio y composición
- [ ] Conversión prospecto → cliente al aceptar; aviso por desactivación de proveedor
- **Fuera:** stock real (la alerta usa una bandera del producto), conversión a proyecto.

## Hito 5 — Proyectos, compras e inventarios
- [ ] Plantillas de proyecto, avance ponderado y conversión oferta → proyecto
- [ ] Motor de reglas de aprobación
- [ ] Inventarios y bodegas
- [ ] Solicitudes de compra y OC en PDF
- **Fuera:** facturación, CXC, CXP.

## Hito 6 — Facturación y finanzas
- [ ] Facturación (FEL si aplica), CXC, CXP
- [ ] Costo real y rentabilidad
- **Fuera:** bancos, comisiones, reportes.

## Hito 7 — Administración, soporte y reportes
- [ ] Bancos y conciliación
- [ ] RRHH y comisiones
- [ ] Reportes e indicadores
- [ ] Helpdesk extendido y mantenimiento
- [ ] Sala de reuniones
- **Fuera:** móvil y portal.

## Hito 8 — Móvil (PWA)
- [ ] Offline con sincronización
- [ ] Geolocalización y chat de proyecto
- **Fuera:** portal de cliente.

## Hito 9 — Portal de cliente
- [ ] Portal con aislamiento estricto por cliente
- **Fuera:** nada más; cierre del plan original.
