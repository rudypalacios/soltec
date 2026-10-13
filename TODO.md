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
  - [x] Acceso de red de la sesión a los subdominios: verificado (2026-10-12), la sesión alcanza `staging`. El QA usa las variables del environment `QA_BASE_URL`, `QA_EMAIL` y `QA_PASSWORD` (cuenta de administrador de `staging`)
  - [x] Lista de requisitos del servidor (`/api/system/requirements`), con verificación SMTP
- [x] 4. ERD: convenciones y Hito 1 detallado; esbozo de los hitos 2 a 9. Las columnas de cada hito se detallan al planearlo
- [x] 5. Esqueleto de autenticación y roles (`docs/arquitectura/autenticacion-y-roles.md`)
- [x] 6. Especificación OpenAPI: **cambio de estrategia** (2026-10-09). No se especifica un hito completo por adelantado: el contrato crece por rebanadas verticales (ver abajo). Quedó la rebanada 1.1 en `contract/openapi.yaml` (19 operaciones con `x-planned`; el flag se quita en el PR que agrega la ruta)
- [x] ADR-0006 (OpenAPI) aceptado recortado (2026-10-12): contrato como fuente única de rutas, tipos y cliente; validaciones en el servidor

## Hito 1 — Fundaciones
**Se construye por rebanadas verticales:** cada una incluye migraciones, API con tests, contrato OpenAPI de sus rutas y lo mínimo en la web para probarla en `staging`. No se pasa a la siguiente sin la anterior desplegada y probada.
- [x] **1.1 Acceso**, en dos PR:
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
  - Acordado: el nivel de margen **no es del ítem ni del proveedor**: es habitual del **cliente** (`clients.margin_level_id`, Hito 2, opcional; sin él se usa el por defecto), lo elige la línea de cotización y se congela en la cotización emitida (Hito 4). El documento de requerimientos decía «MCP por proveedor»; el usuario lo corrigió. Confirmado por el usuario: no hay margen por proveedor
  - Acordado: se siembran «Margen 33 %» (por defecto) y «Margen 35 %»; el cliente agrega los suyos. Todo se gobierna por permisos de perfil (`margin_levels.*`); cambiar el nivel por defecto exige `edit`
  - Hecho: `margin_levels`, CRUD con `set-default`, `POST /v1/price/calculate`, `PriceCalculator` (PHP) y `calculatePrice` (shared) probados con `contract/test-vectors/price.json`; pantalla «Márgenes» en `/configuracion/margenes`: una sola lista de niveles (hay 9 en el legacy, se diseñó para 15 o más) a la que un costo de prueba le agrega los dos precios por nivel; en móvil, una línea compacta por nivel
  - Fuera de 1.4: nivel por cliente o por línea (Hitos 2 y 4), orden manual de los niveles (se listan por margen ascendente), historial de tasas más allá de la auditoría
- [x] **1.5 Seguridad de sesiones, auditoría consultable y dashboard base**, en dos PR independientes (cada uno sale de `main`):
  - [x] **1.5a Parámetros, desbloqueo y dispositivos** (`hito-1/seguridad-sesiones`): `security_settings` (bloqueo, caducidad y largo de contraseña, duración de sesión; reemplaza las constantes de `SecurityPolicy`) con su pantalla `/configuracion/seguridad`; `POST /v1/users/{id}/unlock` y la acción «Desbloquear» en Usuarios; `GET /v1/me/devices` y `DELETE /v1/me/devices/{id}` con la pantalla «Mis sesiones» (`/cuenta/sesiones`); auditoría de `login`, `logout`, `lockout`, `unlock` y `device_revoke`; el navegador se nombra por su user agent («Chrome en Windows»)
  - [x] **1.5b Auditoría consultable y dashboard base** (`hito-1/auditoria-dashboard`): `GET /v1/audit-logs` (permiso `audit_logs.view`, alcance por `user_id`, filtros y cursor) con la pantalla `/auditoria` y el enlace «Ver historial» en la edición de un usuario; `role_widgets`, `GET /v1/dashboard`, `GET /v1/widgets` y los widgets asignados dentro del perfil («Panel de inicio»); `HomePage` pasa a ser el contenedor. Widgets iniciales: `quick_links` y `service_status`; los perfiles existentes los conservan
    - Decidido al construirla: los widgets no declaran un permiso requerido (YAGNI: ninguno lo necesita; cada widget pide sus datos con los permisos de quien lo ve), y la web asigna en el orden del catálogo (la API acepta cualquier orden, sin pantalla para reordenar)
  - Acordado: el login fallido **no** se audita (cualquiera llenaría la tabla con correos inventados); sí el momento del bloqueo. El recurso `dashboard` del ERD se descarta (`GET /dashboard` es de cualquier usuario con sesión y asignar widgets exige `roles.edit`). `security_settings` vive en `Modules/Access`
  - [x] **1.5c Registro en la auditoría** (`hito-1/auditoria-registro`): la columna «Registro» con el nombre del registro afectado, guardado al escribir la entrada (`audit_logs.entity_label`), con enlace a su pantalla (usuarios y perfiles) y «Ver su historial» en el detalle. El nombre de quien actuó se guarda igual (`audit_logs.user_label`). Las entradas anteriores muestran el nombre actual marcado «nombre actual» (en el detalle, para quien actuó)
  - Fuera de 1.5: ver o cerrar las sesiones de otro usuario (desactivarlo ya las cierra), exportar la auditoría, retención o purga de la auditoría (deuda a revisar antes de producción: la tabla solo crece), `push_token`
**Hito 1 cerrado (2026-10-12).** Autenticación, autorización, usuarios y perfiles, departamentos, auditoría, configuración general, márgenes y precio, y dashboard base están hechos y desplegados en las rebanadas 1.1 a 1.5.
- Pasa al Hito 2: las **pruebas de aislamiento por cliente** y el FK `users.client_id → clients` del modelo de usuarios externos. El modelo (tipo y cliente asignado) y la invitación ya existen; no se pueden probar sin la tabla `clients`. Las pantallas del usuario externo siguen siendo del Hito 9.
- **Fuera:** tareas, notificaciones, parámetros de catálogo, catálogo, clientes.

## Transversal — Flujo de ramas con `develop` y E2E con Playwright
- [x] **Flujo de ramas** (ADR-0021, `CLAUDE.md` §7, `docs/despliegue.md`): PR de trabajo a `develop` con squash; `develop → main` con commit de fusión; `pre-deploy` y QA en el PR; producción solo desde `main`. `develop` ya existe y es la rama por defecto.
  - Hecho en GitHub (2026-10-12), con rulesets: `develop` exige PR con solo squash y las pruebas y el job `Playwright`; `main` exige PR con solo merge commit y las pruebas.
- [x] **E2E con Playwright** (`hito-1/e2e`, ADR-0020): infraestructura (servidor desechable con buzón de correo de prueba, estructura atómica en `e2e/`, `.github/workflows/e2e.yml`) y tres escenarios: inicio de sesión, bloqueo y desbloqueo, y auditoría. En un PR hacia `develop` corre solo lo nuevo o cambiado; al caer en `develop`, todo. No corre en el PR de release a `main` (ya pasó en `develop`).
  - Hecho en la rebanada 2.0c del Hito 2: el proyecto móvil (390 px), que solo corre lo marcado `@mobile`. Pendiente: una prueba de humo mínima contra `staging` con la cuenta QA, cuando haga falta.
- **Sigue siendo manual** (no lo cubre el E2E): que un correo llegue a una bandeja real, un teléfono físico y la revisión visual.
- **Reglas del QA de Claude en `staging`:** solo `staging`, nunca producción; datos con prefijo `qa-`; nada se borra, solo se desactiva; nada que envíe correo real; la cuenta QA nunca se usa para probar bloqueos ni renombrarse.

## Hito 2 — Catálogo y clientes
- **P3 (estados de cliente), acordado provisionalmente (2026-10-12):** en el Hito 2 el estado del cliente es un valor de un catálogo configurable (PM2: nombre, color, activo), **sin transiciones ni reglas**, sembrado con seis estados propuestos por el usuario: Prospecto aprobado / por activar, Activo (nuevo), Activo (recurrente), En riesgo / inactivo temporal, Inactivo / dormido, Perdido. En el Hito 2 se asignan a mano.
  - Respuestas del usuario: (1) si el estado «por activar» se solapa con el tipo prospecto/cliente **no se sabe aún**; (2) el estado debe poder cambiar **de forma automática** (por ejemplo, al cerrar la primera cotización) **y a mano** (para devolverlo por cualquier razón); (3) algunos estados sí cambiarán lo que se puede hacer, pero **los disparadores no están definidos**; (4) **«Perdido» no es desactivar**: desactivar significa lo mismo en toda la plataforma (el «pre-delete» lógico) y es independiente del estado.
  - Consecuencias: el motor de estados (Hito 3) debe permitir el cambio manual siempre y el automático por eventos; los estados 2 a 5 dependen de compras (Hitos 4 a 6) y sus umbrales serán configurables; qué estado impide qué, y si «por activar» es un tipo o un estado, se decide en el Hito 4 con el Cotizador. El flujo configurable (transiciones y banderas) es el motor del Hito 3; los clientes lo adoptarán con una migración.
**Se construye por rebanadas verticales** (como el Hito 1). Antes de empezar cada una, Claude entrega su **ficha de arranque** (qué se construye, reglas, qué queda fuera, preguntas) y el usuario la revisa. Modelo: `docs/arquitectura/erd/03-catalogo-y-clientes.md`. Decisiones: ADR-0022 a 0025.
- [x] **2.0a Plan y modelo** (`docs`, solo documentos): ERD del Hito 2, ADR 0022 a 0025, aceptación de los ADR 0015 y 0016
- [x] **2.0b Contrato partido por módulo** (infra, sin cambio de comportamiento): `contract/openapi.yaml` queda como raíz y cada área vive en `contract/modules/<área>.yaml` (documento parcial con `paths` y `components`); `npm run contract:bundle` los une en `contract/dist/openapi.yaml`, que leen Spectral, la generación de `shared/` y `ContractTest`. Cada rebanada del Hito 2 agrega su archivo y se revisa por módulo
- [x] **2.0c Matriz de permisos rediseñada** (web + API, sin rutas nuevas; antes de la 2.1 porque cada rebanada agrega filas a la matriz): secciones plegables con conteo «n/m», filtro por nombre y «Solo con acceso», casillas por fila, columna y sección, tabla continua en móvil con cabecera fija y casillas de 44 px, y el alcance solo en los recursos con dueño (`resources.scoped`: hoy `users` y `audit_logs`)
  - Acordado: toda acción necesita `view` (marcar una marca `view`; quitar `view` quita las demás) en la web, en `shared/` y en el servidor (`422 view_required`); un alcance sobre un recurso sin dueño se rechaza (`422 not_applicable`); la migración da `view` a los perfiles que tenían acciones sin él
  - Incluye el proyecto móvil (390 px) del E2E: solo corre los escenarios con la etiqueta `@mobile`
- [x] **2.1 Parámetros de catálogo** (ficha aprobada el 2026-10-13; un solo PR con API, web y E2E, con `pre-deploy`; si resulta difícil de revisar se parte por API y web, avisando antes)
  - **Datos:** una migración con `contact_types`, `client_statuses` (con `color`), `segments`, `tax_regimes` y `payment_methods`; `name` único entre activos (la colación ignora mayúsculas y acentos). Siembra: PM1 (Comercial, Compras, Facturación), PM2 (los 6 estados de P3), PM5 (8 segmentos), PM6 («Pequeño contribuyente» y «General»); PM7 vacía. Crea los 5 recursos de permisos para `admin`, sin alcance (`scoped` en 0)
  - **Color de los estados:** vive en `client_statuses.color` (`#RRGGBB`). Un cliente solo guarda su `status_id` y la API entrega el estado con su color, así que cambiar el color de un estado lo cambia en todos sus clientes sin tocarlos. La web ofrece 8 colores fijos (paleta en `tokens.ts`) y la API acepta cualquier `#RRGGBB`; un color guardado fuera de la paleta se muestra como noveno en el selector. Paleta: Azul `#0B6BB0`, Turquesa `#00796B`, Verde `#1E7A4C`, Ámbar `#9A5800`, Gris `#7C8996`, Rojo `#B3261E`, Morado `#6B4FA3`, Magenta `#B0306A`. Estados sembrados: Prospecto aprobado / por activar → Azul; Activo (nuevo) → Turquesa; Activo (recurrente) → Verde; En riesgo / inactivo temporal → Ámbar; Inactivo / dormido → Gris; Perdido → Rojo
  - **Rutas (5 × 6 = 30 operaciones, un esquema y un parámetro de ruta por catálogo):** `GET/POST /v1/<slug>`, `GET/PATCH /v1/<slug>/{id}`, `POST /v1/<slug>/{id}/deactivate` y `/reactivate`. Slugs: `contact-types` (`{contactTypeId}`), `client-statuses` (`{clientStatusId}`), `segments` (`{segmentId}`), `tax-regimes` (`{taxRegimeId}`), `payment-methods` (`{paymentMethodId}`). Permiso `<recurso>.view/create/edit/deactivate` (reactivar usa `deactivate`). Un solo código PHP parametrizado por una definición por catálogo (ADR-0016); contrato en `contract/modules/parameters.yaml`
  - **Reglas:** nombre de 1 a 100 caracteres (`422 name: taken` si se repite entre activos, también al reactivar); edición con `version` (`409 conflict`); desactivar es idempotente y no bloquea ni arrastra (ADR-0023); se audita crear, editar, desactivar y reactivar; los estados no tienen transiciones (P3 provisional); el régimen fiscal es solo del perfil de facturación del cliente
  - **Pantalla:** «Parámetros» en `/configuracion/parametros`, entre Numeración y Seguridad (la sección admite varios recursos: se ve con `view` sobre cualquiera, y cada pestaña con `view` sobre el suyo; en móvil las pestañas pasan a un selector). Cada pestaña: lista con búsqueda y filtro de inactivos, alta y edición en diálogo, desactivar y reactivar, como Departamentos; los estados muestran un punto de color junto al nombre. La matriz de permisos gana la sección «Parámetros» en `permissionSections.ts`
  - **E2E (`@mobile`):** ciclo de un segmento (crear, renombrar, desactivar, verlo en inactivos y reactivar) y la siembra presente
  - **Fuera:** las listas `/options` y la autorización «cualquiera de» (llegan con el primer consumidor, 2.3a), PM3, PM4, PM8, PM13, orden manual de valores, transiciones de estado, siembra de formas de pago
- [x] **2.2 Estructura del catálogo** (ficha aprobada el 2026-10-13; un solo PR con `pre-deploy`)
  - **Datos:** una migración con `brands`, `areas` (siembra PM9), `product_groups` (`area_id`, nombre único dentro del área), `unit_categories` y `units_of_measure` (`category_id`, nombre único en toda la tabla; nombres de hasta 60 caracteres); siembra de 5 categorías y 17 unidades. Crea 5 recursos de permisos para `admin`, sin alcance
  - **Rutas (30 operaciones, mismo código genérico de la 2.1 con padre opcional):** `brands`, `areas`, `product-groups`, `unit-categories` y `units-of-measure`; grupos y unidades se filtran con `area_id` / `category_id` y muestran su padre como `area` / `category`; áreas y categorías traen `active_group_count` / `active_unit_count`
  - **Reglas:** un área con grupos activos o una categoría con unidades activas no se desactiva (`409 area_in_use` / `unit_category_in_use` con el conteo); un hijo no se crea ni se mueve a un padre inactivo (`422 not_found` en `area_id`) pero conserva el suyo si se desactivó después; reactivar un hijo bajo un padre inactivo da `422 parent_inactive` en el campo del padre
  - **Pantalla:** entrada «Catálogo» del menú (`/catalogo`) con pestañas Marcas, Áreas, Grupos de producto, Categorías de unidad y Unidades de medida, sobre el mismo componente que Parámetros; sección «Catálogo» en la matriz de permisos
  - **Límite conocido:** el selector de área (o categoría) pide la lista del padre, así que quien edita grupos necesita `areas.view` hasta que lleguen las listas `/options` (2.3a o 2.4a); sin él la pantalla lo dice y no deja guardar
- [x] **2.3a Contactos** (ficha aprobada el 2026-10-13; un solo PR con `pre-deploy`)
  - **Datos:** una migración con `contacts` (dueño `owner_id`, sin unicidad de correo ni nombre), la FK `users.contact_id`, la numeración `contact` (`CON`, sin período, editable en Numeración) y el recurso `contacts` con alcance (`scoped` = 1; `admin` recibe `all`)
  - **Rutas (7):** `GET/POST /v1/contacts`, `GET/PATCH /v1/contacts/{contactId}`, `deactivate`, `reactivate` y `GET /v1/contacts/owner-options` (a quién puede pasar el contacto quien lo edita: su equipo con `team`, todos con `all`, nadie con `own`; lo autoriza `contacts.edit`, no `users.view`, y calcula la lista con la misma regla que valida el cambio). La lista busca por nombre, correo, teléfonos y código y filtra por `owner_id`; el contacto trae su dueño como `owner`
  - **Reglas:** quien crea es el dueño; el alcance (`own`, `team`, `all`) decide por dueño y un contacto fuera del alcance responde `404`; editar reemplaza los datos (lo que falta se borra) y `owner_id` omitido conserva el dueño; pasar el contacto a otro dueño exige alcance `team` (dentro del equipo, `422 out_of_scope`) o `all`, el nuevo dueño debe ser un usuario interno activo (`422 not_found`) y con `own` responde `403`; desactivar no bloquea
  - **Pantalla:** «Contactos» en el menú (`/contactos`, lista tabla/tarjetas, formulario de alta y edición); el responsable se elige solo con alcance `team` o `all` y el selector ofrece únicamente a quienes el servidor aceptaría; con `own` se muestra de solo lectura; sección «Contactos» en la matriz
  - **Fuera:** vínculos con clientes y proveedores (2.3b y 2.5), reasignación en bloque (2.5), lista `/options`, `contact_id` en el formulario de usuarios (Hito 9)
- [ ] **2.3b Proveedores**: identificación NIT/CUI/ninguna única (ADR-0022), direcciones, vínculo con contactos y crédito
- [ ] **2.4a Productos**: costo con IVA y precio calculado, alerta de costo desactualizado, `deactivation_reason`, cascada desde el proveedor, acciones en bloque y selección de filas en `DataList`
- [ ] **2.4b Paquetes**: composición de productos con cantidad decimal y precio como suma
- [ ] **2.5 Clientes**: prospecto y venta, perfil de facturación, varios asesores (`client_sellers`) con un responsable, vínculo de contactos, reasignación (individual y de cartera con los contactos), alcance `client`, FK `users.client_id`, `GET /v1/me/client` reducido, widget `quick_create_client` y pruebas de aislamiento por cliente
- **Acordado:**
  - Cada sección es su propio recurso de permisos y ofrece listas de opciones aparte (ADR-0024)
  - Las unidades de medida son una escalera: categoría (cantidad, longitud, peso, volumen, superficie) y unidades; sin conversiones
  - El régimen fiscal es solo del perfil de facturación del cliente
  - El costo del producto es visible para quien ve productos (sin `view_cost`; `cost` es opcional en el contrato por si hiciera falta)
  - Sin columna `legacy_id`: el Hito 3 usa una tabla temporal de mapeo
  - El QA en `staging` no prueba alcances (crear usuarios envía correos reales): los alcances se cubren con integración y E2E
- **Criterio de cierre del Hito 2:** las rebanadas en `develop` y desplegadas en `staging`; el E2E de cada una en verde; ERD y `TODO.md` al día; P3 anotada como provisional; pendientes de abajo registrados
- **Pendientes anotados (no bloquean el hito):**
  - Formas de pago: sin siembra hasta que el usuario las defina
  - Flujo de solicitud de acceso a un registro existente (por ejemplo, un NIT repetido): Hito 3 o posterior
  - Volcado de estructura del legacy: el usuario lo entregará; se revisa antes del Hito 3
  - Regla completa del CUI (dígito verificador y municipio) si hiciera falta
  - Valores de costo desactualizado (`stale_cost_days`, hoy 90) y colores de los estados: provisionales
- **Fuera:** cotizaciones, conversión automática a cliente, aviso a cotizaciones vigentes, inventario y stock, descuento y anidación de paquetes, conversiones entre unidades, historial de compras, pantallas del usuario externo (Hito 9), PM3, PM4, PM8 y PM13.

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
