# TODO — Sistema CRM-ERP

Lista viva de hitos. Marca `[x]` al terminar y revisar. Cada hito dice explícitamente qué queda **fuera**. Orden y dependencias: `docs/arquitectura/mapa-de-modulos.md`.

## Hito 0 — Planeación y scaffolding
- [x] Resumen de entendimiento, riesgos y contradicciones
- [x] ADR 0001 a 0014 (`docs/adr/`)
- [x] 1. Mapa de módulos y matriz de dependencias
- [x] 2. Estructura del repositorio
- [x] 3. Scaffolding (0B), en etapas:
  - [x] 3.1 Esqueleto de código y CI: API (Slim), web (React + MUI), contrato OpenAPI, `shared/` (PR de código)
  - [x] 3.2 Flujo de despliegue y guía de configuración (`docs/despliegue.md`, workflow Deploy)
  - [x] 3.3 **Configuración del usuario y primer despliegue a `staging`**: cPanel, GitHub Environments y `.env` según la guía (`production` también desplegó)
  - [x] 3.4 Verificación en el servidor con el diagnóstico: MySQL 5.7, columna generada con índice único, WebP en GD, límites de PHP
  - [x] 3.5 Verificación del correo: entrega a Gmail comprobada; Outlook sin probar (decisión del usuario: no hay dónde)
- **Pendientes del 0B** (no bloquean el ERD):
  - [x] Correo: remitente `noreply@musicos-catolicos.com`; P24 (dominio de la organización) sigue abierta hasta antes de producción
  - [x] Archivos del servidor: `.env`, `api/` y `db/` nunca se sirvieron (siempre 403); no hace falta rotar secretos. Cada entorno ya tiene su propio usuario de base de datos en su `.env`
  - [x] Production: sin *Required reviewers* (decisión del usuario: único revisor, repo privado)
  - [ ] Subir `upload_max_filesize` y `post_max_size` (hoy 2M y 8M) antes del Hito 3 (fotos)
  - [ ] Decidir el acceso de red de la sesión a los subdominios (opcional)
  - [x] Lista de requisitos del servidor (`/api/system/requirements`), con verificación SMTP
- [ ] 4. ERD (alcance por confirmar: hitos 1 a 3 detallados, el resto esbozado; incluye usuarios externos y campos de sync)
- [ ] 5. Esqueleto de autenticación y roles (ADR-0012)
- [ ] 6. Especificación OpenAPI de los hitos 1 a 3
- [ ] Confirmar ADR-0006 (OpenAPI), hoy en `Propuesta` (ADR-0004 ya está aceptado)

## Hito 1 — Fundaciones
- [ ] Autenticación: login con JWT y refresh por dispositivo, bloqueo por intentos, recuperar contraseña, expiración de contraseña, revocación de sesiones
- [ ] Autorización: perfiles y permisos por módulo y acción, alcance de datos (propio, equipo, todo), administración de usuarios y perfiles con sus reglas
- [ ] Modelo de usuarios externos (tipo y cliente asignado); las pantallas llegan en el Hito 9
- [ ] Primer administrador por comando de consola
- [ ] Departamentos y jerarquía (jefe directo)
- [ ] Auditoría y desactivación lógica
- [ ] Configuración general (empresa, IVA, ISR, días de costo, validez de cotización, correlativos, remitente de correo, parámetros de sesión y bloqueo)
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

## Al cerrar el proyecto (antes de datos reales en producción)
- [ ] Separar, dentro de cada entorno, el usuario de la aplicación (solo `SELECT/INSERT/UPDATE/DELETE`) del usuario de migraciones (privilegios de esquema). Hoy se usa un solo usuario por entorno a propósito, para no multiplicar cuentas; el cambio es una variable más en el `.env` y en el endpoint de migraciones.
