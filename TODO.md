# TODO — Sistema CRM-ERP

Lista viva de hitos. Marca `[x]` al terminar y revisar. Cada hito dice explícitamente qué queda **fuera**. Orden y dependencias: `docs/arquitectura/mapa-de-modulos.md`.

## Hito 0 — Planeación y scaffolding
- [x] Resumen de entendimiento, riesgos y contradicciones
- [x] ADR 0001 a 0016 (`docs/adr/`); 0015 (UUID v7) y 0016 (catálogos y configuración tipados) siguen en `Propuesta`
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
- [x] 4. ERD: convenciones y Hito 1 detallado; esbozo de los hitos 2 a 9. Las columnas de cada hito se detallan al planearlo
- [x] 5. Esqueleto de autenticación y roles (`docs/arquitectura/autenticacion-y-roles.md`)
- [x] 6. Especificación OpenAPI: **cambio de estrategia** (2026-10-09). No se especifica un hito completo por adelantado: el contrato crece por rebanadas verticales (ver abajo). Quedó la rebanada 1.1 en `contract/openapi.yaml` (19 operaciones con `x-planned`; el flag se quita en el PR que agrega la ruta)
- [ ] Confirmar ADR-0006 (OpenAPI), hoy en `Propuesta` (ADR-0004 ya está aceptado)

## Hito 1 — Fundaciones
**Se construye por rebanadas verticales:** cada una incluye migraciones, API con tests, contrato OpenAPI de sus rutas y lo mínimo en la web para probarla en `staging`. No se pasa a la siguiente sin la anterior desplegada y probada.
- [ ] **1.1 Acceso**, en dos PR:
  - [x] **API** (`hito-1/acceso-api`): migraciones, siembra del perfil `admin`, `php api/bin/console user:create-admin`, login, refresh con rotación, logout, cambio de contraseña, `/me`, usuarios internos, perfiles, `/resources` y `/permissions`, alcance `own`/`all`, auditoría y las reglas de ADR-0012 (último administrador, nadie se desactiva a sí mismo, solo un administrador da o quita `admin`). Las 19 operaciones del contrato ya no están `x-planned`
  - [x] **Web** (`hito-1/acceso-web`, sobre la rama de la API): login, cambio de contraseña (obligatorio con contraseña temporal), lista y alta de usuarios con desactivar y reactivar, lista, alta y edición de perfiles con su matriz; desktop-first y responsive, verificada a 390 y 1280 px.
  - Fuera de 1.1: departamentos, equipo, configuración, márgenes, recuperar contraseña por correo, usuarios externos, dashboard
- [ ] **1.1b Credenciales y edición de usuarios** (justo después de 1.1, sobre `main` ya fusionado): invitación por correo con enlace de un solo uso para fijar la contraseña (el alta deja de pedir contraseña temporal), reenviar invitación, recuperar contraseña por correo (`/recuperar-contrasena`, `/establecer-contrasena`), y la pantalla de edición de un usuario existente (nombre, correo y perfiles; la API ya existe). Depende de `APP_URL` en el `.env` y del correo (ADR-0013)
  - Acordado: la invitación vale 72 h y la recuperación 1 h; ambos enlaces son de un solo uso. Sin contraseña de respaldo: si el correo no llega, el administrador reenvía y nunca ve ni la contraseña ni el enlace. El alta deja de recibir `initial_password` (cambio incompatible de `POST /v1/users`, aceptable antes de producción)
  - Acordado: solo se recupera la contraseña de una cuenta activa que ya aceptó su invitación; con otra cuenta no se envía correo y la respuesta es idéntica. El estado se revisa al usar el enlace, no al emitirlo; un enlace nuevo invalida los anteriores
- [ ] 1.2 Organización: departamentos, jefe directo y alcance `team`
- [ ] 1.3 Configuración general y correlativos
- [ ] 1.4 Niveles de margen y función de precio
- [ ] 1.5 Dispositivos, desbloqueo, auditoría consultable y dashboard base
Detalle de lo que sigue (referencia, no es orden de trabajo):
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
- [ ] Verificaciones de seguridad en el CI: `composer audit` y `npm audit` (hoy solo se corrió `composer audit` a mano) y una revisión de seguridad dirigida a OWASP sobre el código de acceso. Un escaneo dinámico contra `staging` (por ejemplo OWASP ZAP) queda a evaluar
- [ ] Separar, dentro de cada entorno, el usuario de la aplicación (solo `SELECT/INSERT/UPDATE/DELETE`) del usuario de migraciones (privilegios de esquema). Hoy se usa un solo usuario por entorno a propósito, para no multiplicar cuentas; el cambio es una variable más en el `.env` y en el endpoint de migraciones.
- [ ] Proteger `/api/system/requirements` (hoy abierto, a pedido del usuario): expone versiones, estado de la base de datos y del SMTP, y cada petición crea y borra una tabla de prueba y abre un login SMTP.
