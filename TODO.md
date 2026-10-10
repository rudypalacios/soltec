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
- [x] **1.1b Credenciales y edición de usuarios** (`hito-1/credenciales`, ADR-0017): invitación por correo con enlace de un solo uso para fijar la contraseña (el alta deja de pedir contraseña temporal; `/aceptar-invitacion`), reenviar invitación, recuperar contraseña por correo (`/recuperar-contrasena`, `/restablecer-contrasena`), y la pantalla de edición de un usuario existente (`/usuarios/:id/editar`: nombre, correo y perfiles). Depende de `APP_URL` en el `.env` y del correo (ADR-0013)
  - Acordado: la invitación vale 72 h y la recuperación 1 h; ambos enlaces son de un solo uso. Sin contraseña de respaldo: si el correo no llega, el administrador reenvía y nunca ve ni la contraseña ni el enlace. El alta deja de recibir `initial_password` (cambio incompatible de `POST /v1/users`, aceptable antes de producción)
  - Acordado: solo se recupera la contraseña de una cuenta activa que ya aceptó su invitación; con otra cuenta no se envía correo y la respuesta es idéntica. El estado se revisa al usar el enlace, no al emitirlo; un enlace nuevo invalida los anteriores
- [x] **1.2 Organización** (`Modules/Organization`): departamentos (`/departamentos`: lista, alta, renombrar, desactivar y reactivar), jefe directo y departamento en el alta y la edición de usuarios, filtro de usuarios por departamento y alcance `team` en la matriz de perfiles
  - Acordado: equipo = el usuario, sus subordinados directos e indirectos y su departamento. Solo usuarios internos tienen departamento y jefe; los clientes (externos) usan el alcance `client`
  - Acordado: el departamento es opcional en la API (el primer administrador no tiene) y obligatorio en el formulario web mientras existan departamentos activos
  - Acordado: nadie crea ni mueve a un usuario fuera de su alcance (`422 out_of_scope`; con alcance `own` no se crea a nadie). En su propia cuenta, quien no es administrador solo cambia su nombre. Con alcance `team` el formulario propone como jefe a quien crea. El selector de jefe solo ofrece candidatos válidos (`eligible_manager_for`: sin el usuario ni quienes dependen de él)
  - Acordado: un departamento con usuarios activos no se desactiva; el error dice cuántos tiene y la web enlaza a esos usuarios. Desactivar a un jefe no cambia el `manager_id` de sus subordinados
  - Fuera de 1.2: organigrama visual, jefe del departamento como campo propio, reasignación masiva de usuarios
- [x] **Transversal: tema y componentes compartidos de la web** (ADR-0008 y ADR-0018; sin cambios en la API)
  - [x] Muestra para aprobar: tokens, fuente autoalojada y componentes (`DataList`, `FilterBar`, `StatusBadge`, `FormPage`) aplicados a la lista y al alta de usuarios, con capturas a 390 y 1280 px
  - [x] Aplicado a perfiles, departamentos, edición de usuarios, formularios restantes, `AppShell` y pantallas públicas; ADR-0018 Aceptada. Los nombres accesibles de las acciones de Perfiles pasan a «Editar: Ventas»
  - Fuera: modo oscuro, ordenar columnas o seleccionar filas en las listas, tema por empresa (llega con la configuración, 1.3)
- [x] **1.3 Configuración general y correlativos** (`Modules/Settings`, ADR-0019), en dos PR:
  - [x] **API** (`claude/gallant-brown-i3bk81`): tablas `company`, `financial_settings` y `sequences`; datos de la empresa con logo (WebP de hasta 512 px, re-codificado), IVA, ISR, días de costo desactualizado y validez de cotización; correlativos con reserva atómica y sin huecos (`SequenceGenerator`, probado con procesos simultáneos); `GET /v1/branding` y `/branding/logo` públicos
  - [x] **Web** (`hito-1/configuracion-web`, sobre la rama de la API): sección «Configuración» (`/configuracion/empresa`, `/finanzas`, `/numeracion`) con subnavegación lateral en escritorio y pestañas en móvil; `Brand` lee nombre y logo de la configuración (logo, o nombre, o la marca provisional); aviso en el inicio mientras falten los datos de la empresa. Verificada a 390 y 1280 px contra la API real
  - Acordado: el remitente del correo **se queda en el `.env`** (`MAIL_FROM_*`): no hay tabla ni pantalla de correo, para que nadie lo desconfigure. El formato del número es `COT-2610-0001` (año y mes) y el contador vuelve a 1 cada mes en cotización, proyecto y orden de compra; cliente y proveedor no tienen período
  - Acordado: `company.timezone` (`America/Guatemala`) fija el calendario de los correlativos. `stale_cost_days` queda en 90 como valor provisional hasta tener la cifra de la empresa
  - Fuera de 1.3: parámetros de seguridad (van en 1.5), SVG como logo, tema por empresa, régimen fiscal de la empresa (Hito 2)
- [x] **1.4 Niveles de margen y función de precio** (`Modules/Settings`, ADR-0011 y ADR-0014; API y web en un solo PR)
  - Acordado: el nivel de margen **no es del ítem ni del proveedor**: es habitual del **cliente** (`clients.margin_level_id`, Hito 2, opcional; sin él se usa el por defecto), lo elige la línea de cotización y se congela en la cotización emitida (Hito 4). El documento de requerimientos decía «MCP por proveedor»; el usuario lo corrigió. Pendiente: confirmar que el legacy no necesitaba un margen distinto según el proveedor del producto
  - Acordado: se siembran «Margen 33 %» (por defecto) y «Margen 35 %»; el cliente agrega los suyos. Todo se gobierna por permisos de perfil (`margin_levels.*`); cambiar el nivel por defecto exige `edit`
  - Hecho: `margin_levels`, CRUD con `set-default`, `POST /v1/price/calculate`, `PriceCalculator` (PHP) y `calculatePrice` (shared) probados con `contract/test-vectors/price.json`; pantalla «Márgenes» con simulador en `/configuracion/margenes`
  - Fuera de 1.4: nivel por cliente o por línea (Hitos 2 y 4), orden manual de los niveles (`sort_order` se asigna al crear), historial de tasas más allá de la auditoría
- [ ] 1.5 Dispositivos, desbloqueo, auditoría consultable, dashboard base y **parámetros de seguridad** (`security_settings`: bloqueo, caducidad de contraseña, sesión; hoy son constantes en `SecurityPolicy`, no olvidar)
Detalle de lo que sigue (referencia, no es orden de trabajo):
- [ ] Autenticación: login con JWT y refresh por dispositivo, bloqueo por intentos, recuperar contraseña, expiración de contraseña, revocación de sesiones
- [ ] Autorización: perfiles y permisos por módulo y acción, alcance de datos (propio, equipo, todo), administración de usuarios y perfiles con sus reglas
- [ ] Modelo de usuarios externos (tipo y cliente asignado); las pantallas llegan en el Hito 9
- [x] Primer administrador por comando de consola o desde `ADMIN_EMAIL`/`ADMIN_PASSWORD` del `.env` en el despliegue
- [x] Departamentos y jerarquía (jefe directo)
- [ ] Auditoría y desactivación lógica
- [ ] Configuración general: empresa, IVA, ISR, días de costo, validez de cotización y correlativos (1.3); parámetros de sesión y bloqueo (1.5). El remitente del correo se queda en el `.env`
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
