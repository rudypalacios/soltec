# Instrucciones para Claude Code — Planeación y desarrollo del Sistema CRM-ERP Integral

> Guarda este archivo como `CLAUDE.md` en la raíz del repo. Los requerimientos van en `docs/Levantamiento_de_Requerimientos_CRM-ERP_v1.2.md` (fuente de verdad funcional). Este archivo dice **cómo** trabajar; el documento de requerimientos dice **qué** construir.

## 0. Contexto y forma de trabajo

Vas a planear y construir, por hitos, un sistema CRM-ERP desde cero. Antes de escribir código:

1. Lee completo `docs/Levantamiento_de_Requerimientos_CRM-ERP_v1.2.md`.
2. Resume en una página tu entendimiento, los 5 puntos más riesgosos y cualquier contradicción o vacío que detectes. Detente y espera revisión.
3. Trabaja **hito por hito**. Entre un hito y el siguiente, genera el plan del siguiente y espera aprobación.

**Preguntas abiertas (sección 7.1 del documento, P1 a P16):** el usuario no tiene todas las respuestas. No las pidas todas de golpe ni bloquees el trabajo. Reglas:
- Aplica el **supuesto provisional** indicado y deja `// TODO(P#)` donde afecte al código.
- Cuando se acerque un hito cuya pregunta debe confirmarse antes de empezar (columna "Confirmar antes de"), avísale al usuario al planear ese hito y pídele esa respuesta concreta.
- Si una respuesta cambia el modelo, hazlo con una migración; no reescribas.

## 1. Stack y decisiones fijadas

- **Backend:** PHP + SLIM, API RESTful, API-first. Prohibido renderizar vistas desde PHP.
- **Frontend web:** React + TypeScript, **desktop-first, pero responsive: debe verse y sentirse natural tanto en escritorio como en el navegador del teléfono**, con distribución distinta en cada uno. En móvil se puede mostrar menos información (columnas y datos secundarios ocultos o tras un detalle), pero nunca debe verse mal ni romperse. Se usan los breakpoints de MUI.
- **Móvil:** PWA (Android e iOS) con offline y sincronización posterior. Ver 1.1 para dejar la puerta abierta a Expo.
- **Base de datos:** MySQL 5.7, compatible con 8.0 (decidido, ADR-0001).
- **Migraciones:** esquema versionado con Phinx (ADR-0003). Todo cambio de esquema es una migración; nunca se edita la base a mano.
- **Despliegue: una instancia por empresa.** No hay multiempresa ni multi-tenant: **no uses `empresa_id` en las tablas**. Cada empresa es una instancia independiente (subdominio y BD propios) con el mismo código. Consecuencias que debes respetar:
  - Datos de la empresa (nombre, datos fiscales, logo, moneda, correlativos) en una **tabla de configuración**, nunca hardcodeados.
  - Cero valores específicos de un cliente en el código.
  - Las migraciones deben poder correr de forma automatizada en N instancias.
  - Sin vistas consolidadas entre empresas.

### 1.1 Decisiones de arquitectura (obligatorias desde el Hito 0)

**Objetivo:** web y PWA hoy; si la PWA se queda corta (ubicación en segundo plano, sync en segundo plano en iOS, push en iOS), migrar a React Native (Expo) reescribiendo solo la capa de UI.

1. **TypeScript y paquete `shared/` agnóstico de plataforma:** tipos, validaciones (Zod), cliente de API, reglas de negocio puras y lógica de sync. Nada de `window`, `document` ni `localStorage` dentro de `shared/`.
2. **Contrato de API en OpenAPI;** el cliente tipado se genera desde el contrato. Sin endpoints "a la medida" de una pantalla.
3. **Adaptadores para todo lo que toca el dispositivo** (interfaz en `shared/`, implementación por plataforma): almacenamiento offline (IndexedDB/Dexie hoy, SQLite después), almacenamiento seguro de tokens, geolocalización, cámara y archivos, push. La UI nunca llama directo a APIs del navegador.
4. **Protocolo de sync definido en el servidor desde el primer hito:** UUID generado por el cliente, `updated_at`, `version` y `deleted_at` en toda tabla que pueda ir offline; `GET /sync?since=...` y envío por lotes con clave de idempotencia; política de conflictos documentada (última escritura gana en tareas y comentarios; rechazo con revisión manual en datos financieros).
5. **Backend multi-dispositivo:** tabla `dispositivos` (plataforma, token de push, última sincronización); tabla `eventos_ubicacion` (usuario, lat/lng, precisión, origen, timestamp); JWT de acceso + refresh token revocable por dispositivo. No usar sesiones PHP.
6. **UI móvil como app separada,** no el escritorio encogido. Monorepo con `api/`, `web/`, `mobile/` y `shared/`. Datos y estado con TanStack Query. Cero lógica de negocio dentro de componentes React. Evitar librerías de UI atadas al DOM en `mobile/`.

**Se reutiliza en una migración a Expo:** API, tipos, validaciones, reglas de negocio, lógica de sync, hooks de datos. **Se reescribe:** componentes visuales, navegación y los adaptadores.

### 1.2 Estándares de ingeniería

- Cada endpoint tiene tests (unitarios para lógica, de integración para BD y API) y está documentado en OpenAPI: propósito, parámetros, respuestas y errores.
- Validación de toda entrada externa; sin secretos en el repo; mínimo privilegio en permisos.
- Errores explícitos con mensajes útiles; sin `catch` vacíos.
- Simple primero (KISS/YAGNI): no construyas abstracciones para necesidades imaginarias. Extrae lógica repetida a partir de la segunda repetición.
- Decisiones relevantes de arquitectura se registran como ADR breves en `docs/adr/`, con alternativas y consecuencias.
- Idioma: los endpoints de la API y todo el código (identificadores, comentarios, mensajes de log) en inglés; las rutas de las pantallas de la web y los textos de la interfaz en español. Detalle en `docs/arquitectura/estructura-del-repositorio.md`, sección 4.
- Commits y PR explican el *por qué*. Los cambios que afectan cómo se corre o estructura el proyecto actualizan el README en el mismo cambio.
- Los informes de la sesión y el cuerpo de los PR **no cuentan lo que salió bien ni el entorno donde se probó** (versión local de MySQL, cuántas pruebas pasaron, que el lint quedó limpio): el CI ya lo muestra. Dicen el porqué del cambio, lo que el revisor debe decidir o revisar, lo que falló o no se pudo comprobar y lo que queda pendiente.

## 2. Hito 0 — Planeación y scaffolding (antes de programar funcionalidades)

El Hito 0 tiene dos partes: **0A Planeación** (documentos) y **0B Scaffolding** (un esqueleto que camina, sin funcionalidades). Genera estos entregables **en este orden, uno a la vez, deteniéndote para revisión después de cada uno**. El ERD es el que más debe revisarse con calma.

1. **Mapa de módulos y matriz de dependencias** (0A, hecho): `docs/arquitectura/mapa-de-modulos.md`.
2. **Estructura del repositorio** (0A): `api/`, `shared/`, `web/`, `docs/`, migraciones. `mobile/` se crea en el Hito 8.
3. **Scaffolding** (0B): Slim y React (Vite + MUI) mínimos, CI (tests, phpcs, phpstan, eslint, tsc), despliegue por FTPS a `staging` con el endpoint de migraciones, una migración de prueba y un endpoint de salud. Verifica en el servidor real lo que el diseño asume: columna generada con índice único en MySQL 5.7, soporte WebP en GD y envío de correo (buzón de cPanel por SMTP y entrega a Gmail y Outlook). Se entrega en etapas, cada una en su PR: esqueleto de código y CI; flujo de despliegue con su guía (`docs/despliegue.md`); configuración del usuario y primer despliegue a `staging`; verificación del correo. Criterio de terminado: un despliegue a `staging` publica el endpoint de salud y una pantalla vacía de React, con CI verde y la migración aplicada. Antes de empezar, indica al usuario exactamente qué configurar (secretos de GitHub, bases de datos y `.env`).
4. **ERD:** entidades, cardinalidades, PK/FK, índices y campos de sync. Cubre al menos: usuarios (internos y externos) y perfiles, parámetros PM, contactos, clientes (prospecto y venta), proveedores, productos y paquetes, bodegas, cotizaciones, plantillas de tipo de proyecto (etapas/actividades), proyectos, tareas, solicitudes de compra y OC, facturación, CXC/CXP. Alcance propuesto, pendiente de confirmar: detallado para los hitos 1 a 3 y esbozado para el resto.
5. **Esqueleto de autenticación y roles:** diseño según ADR-0012 (roles y permisos como datos, alcance de datos, JWT con refresh, usuarios externos).
6. **Especificación OpenAPI**, por rebanadas (ver sección 8, 2026-10-09): se escribe junto con el código de cada rebanada, no por hitos completos.

No avances a código de funcionalidades hasta que estos entregables existan y estén revisados.

## 3. Hitos de desarrollo

El orden prioriza la **paridad con el sistema legacy** (hitos 1 a 3): se cubre primero lo que el legacy ya hace, para apagarlo pronto, y después se construye el resto. El detalle de módulos, dependencias y validación del orden está en `docs/arquitectura/mapa-de-modulos.md`.

Mantén un `TODO.md` vivo con estos hitos y marca explícitamente qué queda fuera de cada uno.

**Hito 1 — Fundaciones**
- Usuarios, perfiles (roles) y permisos por módulo; departamentos y jerarquía (jefe directo); alcance de datos (propio, equipo, todo)
- Auditoría (usuario, acción, fecha, valores antes/después), desactivación lógica
- Configuración general: datos de la empresa, IVA, ISR, días de costo desactualizado, validez de cotización, correlativos, SMTP
- Niveles de margen (MC) y función de precio (ADR-0011)
- Dashboard base: contenedor y registro de widgets por perfil

**Hito 2 — Catálogo y clientes**
- Parámetros de catálogo (CRUD genérico: tipo de contacto, estado de cliente, segmentos, régimen fiscal, formas de pago), con precarga de PM1 y PM5
- Marcas, áreas (precarga de PM9) y grupos (cada grupo pertenece a un área)
- Contactos; proveedores (cascada de desactivación a productos)
- Productos simples y paquetes (precio del paquete = suma de sus componentes, calculado); alerta de costo desactualizado
- Clientes (prospecto y venta, NIT sin duplicados, vendedor asignado; conversión manual hasta que exista el Cotizador)

**Hito 3 — Tareas, tickets y cierre del legacy**
- Motor de estados (estados, transiciones y banderas semánticas; un estado nuevo aplica solo a registros futuros)
- Hilo de actividad (comentarios, cambios de estado, menciones; bandera interno/externo)
- Notificaciones configurables por perfil y departamento (en la aplicación y por email) y endpoint de actualizaciones para el polling
- Archivos y fotos (almacenamiento local, WebP normal y miniatura, metadatos en JSON)
- Tareas (asignada, estado, vencimiento, hilo) y tickets mínimos (cliente, asignado, estado, descripción, hilo)
- Importación de datos del legacy, prueba paralela y apagado del legacy

**Hito 4 — Cotizador**
- Nueva oferta y plantillas ("ofertas tipo"), estados configurables, PDF descargable, versiones
- Validez configurable (15 días); precio y composición congelados en la cotización; una cotización nueva toma los precios vigentes
- Alerta "validar disponibilidad" por bandera del producto (hasta que exista Inventarios)
- Conversión prospecto → cliente al aceptar la primera cotización; aviso a cotizaciones vigentes al desactivar un proveedor

**Hito 5 — Proyectos, compras e inventarios**
- Plantillas de tipo de proyecto (etapas/actividades ponderadas) y avance ponderado
- Conversión oferta → proyecto con **motor de reglas de aprobación extensible** (diseñado como motor, no como 4 `if`)
- Solicitud de compra (paquetes desglosados), comparación bodega/ofertado/solicitado, OC en PDF por proveedor
- Bodegas y movimientos de inventario; la alerta de existencia pasa a leer el saldo real

**Hito 6 — Facturación y finanzas**
- Facturación flexible por etapa (con FEL si P1 lo confirma), CXC, CXP, costo real y rentabilidad por proyecto

**Hito 7 — Administración, soporte y reportes**
- Bancos y conciliación, RRHH, comisiones (motor configurable), reportes, helpdesk extendido (equipos, contratos, SLA, prioridad), mantenimiento, sala de reuniones

**Hito 8 — Móvil (PWA)**
- Dashboard móvil, offline con sync, geolocalización, chat de proyecto

**Hito 9 — Portal de cliente externo**
- Vista de lo propio, facturación, progreso, comunicación tipo JIRA, aislamiento estricto por cliente

## 4. Invariantes (no negociables en ningún hito)

- Cambios de costo o precio nunca alteran cotizaciones ya emitidas.
- Combos se actualizan automáticamente salvo dentro de una cotización vigente.
- Nada se elimina físicamente: se desactiva y se audita.
- Todo cambio de estado de un proyecto notifica al jefe o supervisor.
- Notificaciones configurables por rol y área, no hardcodeadas.
- Numeración de proyectos, cotizaciones y OC autogenerada, única y a prueba de concurrencia.
- Los estados nuevos aplican solo a registros futuros.
- El precio de catálogo no se guarda: se calcula desde el costo, el nivel de margen, el IVA y el ISR (ADR-0011).

## 5. Flujo de trabajo sugerido en la sesión

1. "Lee `CLAUDE.md` y `docs/` completos y entrégame el resumen de una página con riesgos y contradicciones. No generes nada más."
2. Revisión del usuario.
3. Hito 0, entregable por entregable, con revisión entre cada uno.
4. Plan detallado del Hito 1, aprobación, implementación módulo por módulo con tests.
5. Repetir para cada hito: plan, aprobación, implementación, verificación contra los criterios de aceptación.

## 6. Qué preguntas abiertas se acercan a cada hito

| Hito | Preguntas a confirmar antes de empezar |
|------|----------------------------------------|
| 0 | P15 resuelta: MySQL 5.7 (ADR-0001) |
| 1 | P5 (roles; no bloquea el esquema) |
| 2 | P3 (estados de cliente) antes de cerrarlo |
| 3 | P7 (migración de datos), P20 (contraseñas del legacy), P23 (esquema y datos del legacy) |
| 4 | P17 (descuento de paquete), P18 (paquetes anidados), P19 (renovación de cotización vencida) |
| 5 | P2 (proyectos consolidados), P4 (momento de la OC) |
| 6 | P1 (FEL; la moneda ya es GTQ), P8 (rentabilidad) |
| 7 | P9 (CM/UOP/UAI/UN), P10 (comisiones), P11 (reportes), P13 (cliente de convenio), P21 (campos extendidos del ticket) |
| 8 | P6 (geolocalización y dispositivos), P12 (Agenda), P22 (chat libre) |
| Antes de producción | P14 (normativa de datos), P24 (dominio remitente del correo) |

El detalle de P1 a P16 y el Anexo A de propuestas están en el documento de requerimientos; P17 a P23 están en `docs/arquitectura/mapa-de-modulos.md`.

## 7. Entorno de ejecución y reglas de sesión

> Cada sesión nueva arranca sin memoria de las anteriores. Lo que importa vive en el repo: este archivo y `docs/` (requerimientos, `docs/adr/`, `docs/arquitectura/`). Léelos al empezar.

- **Dónde corres.** Claude Code en la web, dentro de un *environment* configurado por el usuario: un contenedor en la nube, efímero, con sus repositorios, variables y secretos, política de red y script de setup. Lo que no se commitea y se sube a GitHub se pierde cuando termina la sesión.
- **Si algo no se puede alcanzar** (un host bloqueado por la red del environment, un secreto o variable que falta, una herramienta que no está instalada, un permiso de GitHub), normalmente se puede configurar. No lo rodees en silencio: avisa al usuario qué falta y dale los pasos concretos. Los pasos vigentes están en la documentación del environment (herramienta `read_documentation`).
- **Ramas.** `main` es producción y `develop` es la rama de integración y la de GitHub por defecto (ADR-0021). Cada PR de trabajo usa una **rama nueva**, creada desde `develop` actualizada con `git fetch --prune origin develop && git checkout -B <rama> origin/develop`, y con un nombre descriptivo del cambio: `<tipo>/<tema>` (por ejemplo `docs/reglas-de-ramas`, `hito-1/autenticacion`). Se sube con `git push -u origin <rama>`, sin forzar, porque es nueva. No se trabaja directo en `develop` ni en `main`. La rama que designe la sesión puede usarse para el primer cambio; los siguientes van en ramas nuevas.
- **Un cambio, un PR.** Los cambios de naturaleza distinta, aunque sean del mismo alcance (por ejemplo una regla del proceso y un entregable de arquitectura), van en ramas y PR separados, cada uno saliendo de `develop`. Si en una misma sesión surgen varios, se crea una rama por cada uno y se vuelve a `develop` entre ellos.
- **Una rama fusionada se borra y no se reutiliza:** ni su historial ni su nombre. Nunca se hace push a una rama cuyo PR ya fue fusionado. El `--prune` evita que la copia local apunte a una rama remota que GitHub ya borró.
- **Dos tipos de fusión** (no se mezclan: squash en una rama pública separa los historiales y el siguiente release da conflictos):
  - **PR de trabajo → `develop`: *squash and merge*.** Cada rama entra a `develop` como un solo commit, y los commits de la rama no quedan como ancestros de `develop`. Por eso, antes de empezar a trabajar y antes de cada push: `git fetch origin develop && git rebase origin/develop`. Si la rama ya estaba subida, el push es `git push --force-with-lease`. No se hace merge de `develop` a la rama: el historial se mantiene lineal.
  - **Release `develop` → `main`: PR con commit de fusión (*create a merge commit*), nunca squash ni rebase.** Lo abre y lo fusiona el usuario; despliega a producción. Nadie hace push directo a `main`.
  - No se apilan ramas sobre otra rama sin fusionar. Si un trabajo depende de un PR abierto, se espera su merge; si hay que adelantarse, al fusionarse el PR base se corta con `git rebase --onto origin/develop <último commit del PR base>`.
  - El título del PR de trabajo pasa a ser el mensaje del commit en `develop`, junto con su descripción o la lista de commits según la configuración del repo: escríbelos como mensaje final (el porqué) y mantenlos actualizados si el PR cambia.
- **Pull requests.** Cuando consideres terminado el trabajo y quieras que el usuario lo revise, crea el PR de inmediato contra `develop`, sin esperar a que lo pida; el cuerpo explica el porqué del cambio. Aplica también a cada entregable del Hito 0: el PR se crea en el punto en que te detienes para revisión. Si el cambio toca comportamiento, el PR lleva `pre-deploy` y el QA en `staging` se hace **antes** de fusionar.
- **Seguimiento del PR.** Al crear un PR, Claude se suscribe a su actividad (`subscribe_pr_activity`) y no lo suelta hasta que se fusione o se cierre. Si el CI falla, o llega una revisión o un comentario que le toca, diagnostica y sube el arreglo de inmediato, sin pedir permiso; solo consulta al usuario cuando hay una decisión que es suya. Antes de subir, corre las comprobaciones completas del CI (`composer lint`, `analyse` y `test` en `api/`; lint, `tsc` y pruebas en `web/` y `shared/`), no solo las rutas que tocó.
- **Cierre de sesión.** Una sesión se abre para un contexto (por ejemplo, la autenticación), no para un PR. Un PR fusionado no es motivo de cierre: un mismo tema puede generar varios PR y correcciones. El corte llega cuando **el contexto para el que se abrió la sesión quedó completo** (un entregable, un hito o una parte completa) y **lo que sigue ya no necesita la conversación**, porque todo lo necesario está en el repo. Entonces, y solo entonces, sugiere al usuario cerrar la sesión y abrir una nueva. Si para decidir el siguiente paso todavía hay que apoyarse en lo hablado en la sesión, no se cambia de sesión.

  La sugerencia es corta e incluye:
  1. **Qué quedó hecho:** PR abiertos o fusionados, con su enlace.
  2. **Qué falta del usuario:** fusiones y respuestas pendientes.
  3. **Siguiente paso:** el entregable o el hito que sigue.
  4. **Prompt listo para pegar** en la sesión nueva: qué archivos leer (`CLAUDE.md`, `TODO.md` y los documentos del tema) y la tarea concreta.

  Antes de sugerirlo, deja `TODO.md` al día y confirma que nada importante vive solo en la conversación. No se sugiere con trabajo sin subir, con un PR esperando un arreglo del CI ni con una decisión en discusión. La decisión de cerrar es del usuario.

## 8. Registro de decisiones técnicas de Claude

Las decisiones técnicas menores que Claude toma sin consultar (nomenclatura, estructura interna, herramientas de apoyo) se anotan aquí con fecha y motivo. Las decisiones grandes o difíciles de revertir se consultan al usuario y se registran como ADR en `docs/adr/`.

| Fecha | Decisión | Motivo |
|-------|----------|--------|
| 2026-10-08 | Las preguntas nuevas continúan la numeración del documento de requerimientos (P17 en adelante) y viven en `docs/arquitectura/mapa-de-modulos.md`. | Evita editar el documento de requerimientos, que es la fuente funcional. |
| 2026-10-08 | El scaffolding (0B) va después de la estructura del repositorio y antes del ERD. | Valida el hosting real (MySQL 5.7, FTPS, GD, correo) antes de diseñar el modelo de datos sobre él. |
| 2026-10-08 | El servidor (PHP) calcula los precios; `shared/` tiene una versión TypeScript solo para vista previa, y ambas se prueban con los mismos vectores (`contract/test-vectors/`). Ver ADR-0014. | El ADR-0011 decía solo `shared/`, pero el servidor debe ser la fuente de verdad para congelar precios. |
| 2026-10-08 | El despliegue es automático: un push a cualquier rama distinta de `main` despliega al entorno `staging` (`test.musicos-catolicos.com`); el squash merge a `main` despliega a `production` (`soltec.musicos-catolicos.com`). `workflow_dispatch` aplica la misma regla. Las pruebas viven solo en `tests.yml` y corren desde Deploy; el entorno `production` se limita a la rama `main`. | Decisión del usuario (ADR-0004). Evita ejecutar las pruebas dos veces y que una rama despliegue a producción. |
| 2026-10-08 | Los endpoints de despliegue (`/api/system/*`) quedan fuera de `/v1` y del contrato público, y se desactivan sin `DEPLOY_TOKEN` de al menos 32 caracteres. | Son infraestructura, no API de negocio, y no deben poder usarse en un servidor sin configurar. |
| 2026-10-09 | **En la sesión sí se pueden correr las herramientas de PHP:** `vendor/` viene instalado por el setup script del environment, así que se usan `phpcs`, `phpstan analyse` y `phpunit` desde `api/`. Las pruebas de integración necesitan MySQL levantado; sin él fallan con `Connection refused` y eso no indica un defecto del código. Si `vendor/` falta, no insistir con `composer install`: avisar al usuario para ajustar el setup script. El CI sigue arrancando MySQL con `docker run` para que su log no entierre los resultados. | Antes `composer install` fallaba y se colgaba por la red limitada a un repositorio. El setup script ahora instala las dependencias. Reemplaza la nota anterior del mismo día. |
| 2026-10-08 | Los commits añaden rutas explícitas (`git add <archivos>`), no `git add -A`, y se revisa `git diff --cached --stat` antes de confirmar. | Al cambiar de rama quedaron `node_modules` y `dist` sin ignorar y un `git add -A` los subió al PR #8 (24.248 archivos; sin secretos). Se reconstruyó la rama con solo los 7 archivos previstos. |
| 2026-10-08 | Las secciones 2 a 5 del mapa de módulos se generan con `docs/arquitectura/herramientas/generar_mapa.py` (`python3 -I generar_mapa.py salida.md`). | Tabla, matriz y diagrama salen de una sola fuente y el script valida que ninguna dependencia dura apunte a un hito posterior. |
| 2026-10-09 | El envío de prueba de correo es `POST /api/system/mail/test` (token de despliegue, fuera de `/v1`) y se lanza solo con el workflow manual *Mail test* contra `staging`; vive en un controlador aparte de `DeployController`. | Un servidor sin `MAIL_*` debe seguir migrando y desplegando, y ningún push debe enviar correos. |
| 2026-10-09 | El trabajo de cada hito se parte en **rebanadas verticales** (migraciones + API con tests + contrato OpenAPI de esas rutas + lo mínimo en la web para probarla en `staging`). El contrato OpenAPI no se escribe por adelantado para un hito completo. Reemplaza el entregable 6 como estaba (hitos 1 a 3). | Decisión del usuario: 50 operaciones de golpe eran demasiado superficie por revisar y más fácil de errar; una rebanada probable en `staging` da retroalimentación temprana. |
| 2026-10-09 | La web es **desktop-first y responsive desde la rebanada 1.1** (por el tamaño de la aplicación el diseño parte del escritorio, pero en móvil debe verse bien aunque muestre menos información): breakpoints de MUI, navegación adaptada (menú lateral en escritorio, cajón o barra inferior en móvil), tablas que pasan a lista de tarjetas en pantallas pequeñas, controles táctiles de al menos 44 px y formularios de una columna y datos secundarios reducidos en móvil. Cada rebanada se verifica a 390 px y a 1280 px de ancho. La app móvil nativa del Hito 8 sigue siendo opcional y solo aporta offline, geolocalización y push. | Decisión del usuario: la web debe funcionar bien en el teléfono desde ya, aunque la app móvil llegue después. Antes solo decía "desktop-first", sin exigir que en móvil se viera bien. |
| 2026-10-09 | La migración de siembra de la rebanada 1.1 crea solo los recursos `users` y `roles` y el perfil `admin`; cada rebanada agrega su recurso y se lo concede a `admin` en su propia migración. `external_client` llega con el portal. El diseño decía sembrar todos los recursos del Hito 1 de una vez. | Evita recursos sin pantalla ni rutas, y deja el permiso de cada módulo junto al código que lo usa (ADR-0012). |
| 2026-10-09 | Las migraciones no usan clases de la aplicación (`Soltec\...`); una prueba lo comprueba. | El despliegue aplica las migraciones antes de subir el código nuevo: una siembra que llamaba a `Uuid` pasó todas las pruebas y falló en `staging` con `Class not found`. |
| 2026-10-09 | En la web, el token de acceso vive solo en memoria (`AuthSession` de `shared/`); al recargar la página la sesión se recupera con la cookie de refresco. Los hooks de datos reciben el cliente de API del contexto de sesión, no de un singleton. | Un token en `localStorage` queda al alcance de cualquier script; y con el cliente en el contexto las pruebas usan una API simulada sin tocar `fetch` global. |
| 2026-10-09 | `PermissionChecker` no existe como clase: `CurrentUser::can` hace la comprobación sobre los permisos que el usuario ya trae cargados. | Una clase aparte solo reenviaría la llamada (YAGNI). |
| 2026-10-09 | El despliegue a `staging` ocurre solo en un PR con la etiqueta `pre-deploy` (y por *Run workflow*); las pruebas corren en todo PR y `production` sigue igual (push a `main`). Cambia la fila del 2026-10-08 sobre el despliegue automático por rama. | Decisión del usuario: no todo cambio (uno solo de texto, por ejemplo) debe desplegarse; así quien revisa controla qué se prueba en `staging`. |
| 2026-10-09 | La imagen `mysql:5.7` del CI sale de `mirror.gcr.io` fijada por digest (el mismo digest que la oficial de Docker Hub). | Docker Hub rechazó las descargas anónimas de los runners (`toomanyrequests`) y dejó en rojo el CI sin culpa del código; el digest fija el contenido sea cual sea el registro. |
| 2026-10-09 | **La documentación solo recoge lo técnico, lo lógico o lo que exige mucho conocimiento;** no se anota todo lo que el usuario dice ni lo evidente. Las respuestas en la sesión son cortas: solo los puntos relevantes. | Decisión del usuario: demasiado texto que leer. |
| 2026-10-10 | Los departamentos viven en el módulo `Organization`, que usa `AuditLogger`, `ActorContext` y `CurrentUserAware` de `Access` (02 depende de 01). `Access` no usa clases de `Organization`: al asignar un departamento solo consulta la tabla `departments`. | Evita una dependencia circular entre módulos sin mover piezas al `Kernel` antes de que otro módulo las necesite. |
| 2026-10-10 | Un error de la API puede llevar miembros extra en el cuerpo (RFC 9457), como `active_user_count` con `department_in_use`; `ApiError` de `shared/` los expone en `details`. | La pantalla debe decir por qué no se pudo (cuántos usuarios activos quedan) sin otra petición. |
| 2026-10-10 | Los componentes compartidos de la web viven en `web/src/components/` y se extraen cuando una pantalla se repite por tercera vez (`DataList`, `FilterBar`, `StatusBadge`, `FormPage`). Los tamaños táctiles (campos de 48 px, controles de 44 px) se activan por `(pointer: coarse)` o ventana angosta, no solo por ancho; el cambio de diseño tabla/tarjetas sigue siendo por ancho. Valores en `web/src/theme/tokens.ts`. Ver ADR-0018. | Tres listas repetían lo mismo, y una tableta táctil en horizontal quedaba con controles de escritorio. |
| 2026-10-10 | El remitente del correo se queda en el `.env`; no hay `mail_settings` ni pantalla de correo. Cambia lo que decía el ADR-0013 sobre la configuración general. Ver ADR-0019. | Decisión del usuario: que nadie lo desconfigure desde la interfaz; ya funciona y está verificado. |
| 2026-10-10 | El logo se sube como cuerpo `PUT` de la imagen (no multipart), se identifica por su contenido y se re-codifica siempre a WebP; sin SVG. `/v1/branding` y `/branding/logo` son públicos y solo exponen nombre y logo. | Un solo archivo y ningún otro campo; re-codificar elimina metadatos y datos ocultos; el inicio de sesión muestra la marca antes de tener sesión. |
| 2026-10-10 | Los correlativos tienen período `none`, `year` o `month` (`COT-2610-0001`), se reservan dentro de la transacción del documento y no cambian de período una vez emitido un número. Ver ADR-0019. | Único y sin huecos aun con peticiones simultáneas; cambiar el período con números emitidos podría repetirlos. |
| 2026-10-10 | El nivel de margen es del **cliente** (habitual, opcional) y de la línea de cotización, nunca del producto ni del proveedor; el precio de catálogo se calcula con el nivel por defecto o el que se elija. `margin_levels` siembra 33 % (por defecto) y 35 %, y todo se gobierna con permisos de perfil. Cambia lo que decía el documento de requerimientos («MCP por proveedor»). | Decisión del usuario: el proveedor le vende a la empresa, no es a quien ella vende; el margen varía por cliente y solo importa congelarlo en la cotización. |
| 2026-10-10 | La función de precio no usa `float` ni `bcmath`: división larga con enteros en PHP y `BigInt` en TypeScript, con los mismos vectores. Los cambios que mueven el nivel por defecto bloquean todas las filas de `margin_levels`. | El entorno de pruebas y posiblemente el hosting no tienen `bcmath`; un `float` podría diferir en un centavo del legacy. Son pocas filas, y el índice único de `default_marker` queda como respaldo. |
| 2026-10-10 | Una migración que ya corrió en `staging` no se edita: se agrega otra que corrija el esquema (idempotente), aunque su PR siga abierto. Los niveles de margen se listan por margen ascendente y `sort_order` se quitó con `20261010000004`. | Phinx no vuelve a correr una migración registrada: editarla dejaría `staging` con un esquema distinto al de una base nueva. |
| 2026-10-10 | `Brand` nunca pinta una marca por defecto: sin nombre dice «Dashboard» y, mientras no conoce la marca, reserva el espacio en blanco. La marca se recuerda en `localStorage` (con respaldo si el navegador lo rechaza), se pide al arrancar la app y sobrevive al cierre de sesión (es pública). El logo pedido con `?v=<versión>` se sirve inmutable. Reemplaza la «marca provisional» del ADR-0018. | El salto entre la marca por defecto y la de la empresa se veía en cada carga y al cerrar sesión. |
| 2026-10-10 | `security_settings` vive en `Modules/Access`, no en `Settings`; el login fallido no se audita (sí el bloqueo, el desbloqueo, el login, el logout y el cierre de un dispositivo); el navegador se nombra por su user agent al iniciar sesión. Un error de validación de contraseña lleva `password_min_length` para que la pantalla diga el mínimo vigente. | Son parámetros de `Access` y así no hay dependencia circular; con correos inventados cualquiera llenaría una tabla que solo crece; y una lista de sesiones llamadas todas «Navegador web» no deja reconocer cuál cerrar. |
| 2026-10-11 | La auditoría se lee con un cursor `(occurred_at, id)`, no con páginas; el catálogo de widgets vive en PHP (`WidgetCatalog`) y como enum `WidgetCode` del contrato, con una prueba que los iguala, y el registro de la web se tipa con ese enum; al desplegar, todos los perfiles existentes reciben los dos widgets que tenía el inicio. | La tabla solo crece y un desplazamiento se movería con cada entrada nueva; así un widget que el servidor asigna y la web no dibuja falla en `tsc` y no se ve como un hueco; y el inicio de nadie cambia el día del despliegue. |
| 2026-10-12 | **El QA de un PR con `pre-deploy` lo hace Claude en `staging`** con las variables del environment `QA_BASE_URL`, `QA_EMAIL` y `QA_PASSWORD`, y entrega un informe corto (qué pasó, qué falló, qué no se pudo comprobar, qué datos `qa-` quedaron). Solo `staging`; datos con prefijo `qa-`; nada se borra; nada que envíe correo real; la cuenta QA no se usa para bloquearla ni renombrarla. Cuando exista el E2E (ver `TODO.md`), lo repetitivo pasa a pruebas del CI. | El usuario no siempre puede probar a mano; la sesión alcanza `staging`, y un informe con lo que no se pudo comprobar evita dar por bueno lo que no se vio. |
| 2026-10-12 | Las pruebas E2E (Playwright, `e2e/`) corren contra un servidor desechable en el CI: solo lo nuevo o cambiado en un PR hacia `develop`, y todo al caer en `develop`. Un PR que cambia comportamiento que no se quiere roto trae su escenario. Ver ADR-0020. | Decisión del usuario: la regresión completa va al unir en `develop`, y el PR solo prueba lo suyo para no alargar el ciclo; `staging` queda para el QA de Claude. |
| 2026-10-12 | Los PR de trabajo salen de `develop` y vuelven a `develop` con squash; `develop → main` es un PR de release con commit de fusión. `pre-deploy` y el QA siguen en el PR; producción solo despliega desde `main`. Ver ADR-0021. Reemplaza las reglas de ramas y de fusión de la sección 7 que tomaban `main` como base. | Decisión del usuario: seguir la regla de no hacer squash en ramas públicas, y que `main` solo reciba lo que ya se unió y se probó en `develop`. |
| 2026-10-12 | **En el Hito 2, antes de cada rebanada Claude entrega su ficha de arranque** (qué se construye, reglas que aplican, qué queda fuera y las preguntas abiertas) y la rebanada empieza con el visto bueno del usuario. Va en la conversación, no en el repo. | Decisión del usuario: el hito es amplio y siempre puede haber algo que no se ve; la ficha lo hace visible antes de escribir código. |
| 2026-10-12 | Cada sección es su propio recurso de permisos, con listas de opciones (`GET /v1/<recurso>/options`) para usar sus valores sin administrarlas. Ver ADR-0024. | Decisión del usuario: quien edita productos puede elegir proveedor o marca sin tener acceso a sus secciones. |
| 2026-10-12 | Un contacto lo ve solo su dueño (o su equipo, o todos, según el alcance); un cliente de venta puede tener varios asesores con un responsable; el cliente externo solo ve su perfil reducido por `GET /v1/me/client`. Ver ADR-0025. | Decisión del usuario: cada asesor conserva sus contactos y nadie roba leads; el portal nunca debe mostrar estado, margen ni asesores. |
| 2026-10-12 | Sin columna `legacy_id` en las entidades: la importación del Hito 3 usa una tabla temporal de mapeo. | Decisión del usuario: no aporta más allá de la importación y ensucia el modelo. |
| 2026-10-12 | El contrato OpenAPI se parte en una raíz y un archivo por área en `contract/modules/`. Cada módulo es un documento parcial (`paths` y `components`) y `contract/bundle.mjs` los une en `contract/dist/openapi.yaml` (no se versiona), que lo leen Spectral, `shared/` y `ContractTest`; los `$ref` siguen siendo `#/components/...`. Una ruta o un componente definido dos veces es un error. | Decisión del usuario: Claude lee y revisa por módulo en lugar de cargar 3.000 líneas. Spectral 6.17 rechaza un `$ref` a nivel de ruta, así que el `$ref` estándar también exigía unir, y además pedía reescribir 440 referencias y mantener un índice. |
| 2026-10-13 | La matriz de permisos agrupa los recursos por sección con un mapa de la web (`permissionSections.ts`; un recurso sin sección cae en «Otros»); `resources.scoped` dice cuáles tienen dueño y solo a ellos se les ofrece y acepta un alcance; toda acción exige `view`, con la regla en `shared/` (`setActions`) y también en el servidor. El E2E gana un proyecto móvil (390 px) que solo corre lo marcado `@mobile`. | Decisión del usuario, tras revisar una maqueta: cada rebanada agrega filas a la matriz, un selector de alcance que no hace nada confunde, y un perfil con «Editar» sin «Ver» no sirve. El mapa es presentación; el servidor no se fía de la web.|
| 2026-10-14 | **Todo botón que cambia datos pide confirmación** (un diálogo con lo que va a pasar): desactivar, reactivar, marcar costo como revisado, también desde la barra de selección. Solo lo que no escribe (ver, filtrar, calcular con otro margen) actúa de inmediato. | Decisión del usuario: ningún clic suelto debe cambiar la base de datos por error. |
| 2026-10-14 | La lista de productos es la opción C2: código en etiqueta y columna propia, marca y unidad bajo el nombre, costo y precio como moneda (código de moneda de los ajustes financieros en `meta.currency_code`), precio con y sin IVA en una celda, orden `sort` (nombre, código, costo, costo revisado hace más tiempo), `grouped` con encabezado por área y grupo que se repite en cada página, 25/50/100 por página y, en móvil, tarjeta compacta con filtros y selección tras «Filtros» y «Elegir». «Ver con otro margen» lo calcula el servidor. | Decisión del usuario tras comparar maquetas con 838 productos del legacy: lo importante a primera vista y sin recargar el móvil. |
| 2026-10-14 | Un registro inactivo en una lista se marca con tres señales suaves: franja a la izquierda y tinte rojos apenas visibles y la etiqueta «Inactivo» (el amarillo es solo de «Costo desactualizado»). Los filtros y campos de proveedor, área, grupo y marca se escriben para buscar: el proveedor en el servidor (`SupplierSelect`) y los demás sobre la lista ya cargada (`SearchableSelect`); margen y orden siguen siendo desplegables. | Decisión del usuario tras revisar una maqueta: con «Todos» el inactivo pasaba desapercibido, y las listas largas no se recorren bien en un desplegable. |
| 2026-10-14 | En el formulario de producto, proveedor, grupo y marca se crean desde su buscador con la última opción «Crear "texto"» (solo sin coincidencia exacta y con el permiso de crear de esa sección), que abre un diálogo con el nombre ya escrito y deja lo creado elegido, sin salir del formulario. El proveedor usa un alta rápida de tres campos (nombre, tipo de identificación y número); lo demás se completa en Proveedores. | Decisión del usuario: el enlace al alta de proveedor sacaba del flujo y, al guardar o cancelar, no volvía al producto. |
| 2026-10-14 | Un paquete es un producto compuesto: tiene grupo (y área) y marca opcional, pero no unidad, proveedor ni costo propios; su costo es la suma de cantidad por costo de sus componentes y su precio sale de ahí, sin guardar nada. Quien ve paquetes ve costos. Un componente desactivado después de entrar deja al paquete con `has_inactive_components`, y el Cotizador no lo cotizará. Ver `docs/arquitectura/erd/03-catalogo-y-clientes.md`. | Decisión del usuario: los paquetes se tratan como productos; la sección es para vendedores, que necesitan ver el costo; y un paquete con productos fuera de uso no debe venderse. |
| 2026-10-15 | «Productos» es una sola entrada del menú con pestañas Productos y Paquetes; cada pestaña es su ruta y su permiso `view` (la barra sale solo con ambos y la entrada abre la primera que el perfil ve). `bundles` va en la sección «Productos» de la matriz. | Decisión del usuario: para quien usa el sistema es un solo catálogo, pero los permisos siguen separados (ADR-0024). |
| 2026-10-15 | Los componentes de un paquete son una tabla en escritorio y una lista compacta en teléfono (nombre a todo el ancho; código y alertas en su línea; caja de cantidad de 120 px; costo por unidad sobre el subtotal). El botón de quitar sale del flujo (posición absoluta) y la fila mide lo que mide su contenido. | Un `Stack` de MUI reinicia los márgenes de sus hijos: el margen negativo con el que se quería restar el alto del botón nunca se aplicaba. Una retícula 2×2 y una columna angosta de código se descartaron por dejar huecos y desalinear con nombres largos. |
| 2026-10-15 | El costo desactualizado se marca en el componente que lo tiene (franja y tinte ámbar y etiqueta), como el inactivo en rojo, y no en el pie del costo. El pie del costo del paquete es una lista numerada: precio con IVA y margen, costo más antiguo y la aclaración de que es una vista previa. | Decisión del usuario: la alerta pertenece a la fila que la causa; el pie son los tres textos de siempre, al tamaño de una nota, no letra pequeña. |
| 2026-10-15 | `formatMoney` escribe el símbolo de la moneda (tabla `SYMBOLS`; una moneda sin símbolo sale con su código) y usa cifras en-US. | `currencyDisplay: 'narrowSymbol'` seguía mostrando «GTQ» en un teléfono real: lo que imprime un navegador depende de sus datos de idioma. |
| 2026-10-15 | En las tarjetas de lista de teléfono, el precio tiene su fila, el número de componentes (o la unidad) va arriba junto al código y marca, proveedores y grupo van bajo el nombre, cada uno recortado con «…» por separado (`MetaLine`). | Con textos largos, la línea de proveedor y grupo se estiraba a diez líneas junto al precio, y el recorte se llevaba el número de componentes. |
| 2026-10-15 | **Todo diseño con texto o cifras variables se prueba con el peor caso, a 390 y a 360 px:** título de cinco líneas, cantidad de cinco cifras con decimales, unidad larga («Metro cuadrado») y subtotal de siete cifras. Se mira en la pantalla real, no solo en una maqueta, con las medidas del tema (campos de 48 px en táctil). | Las dos primeras maquetas de los componentes se veían bien y la app real no: faltaban esas medidas y esos casos. |
| 2026-10-15 | **Todo registro inactivo se marca igual en toda lista:** `DataList` recibe `isInactive` y aplica franja, tinte y texto gris (tabla) o franja y tinte (tarjeta); la columna de estado muestra la píldora «Inactivo» (`ActiveBadge`). Las pantallas con varias secciones (Configuración, Catálogo) usan `SectionNav`: lista a la izquierda en escritorio y pestañas con desplazamiento en teléfono; los parámetros dentro de Configuración llevan las pestañas arriba para no apilar dos listas laterales. El botón «Nuevo …» de las listas del catálogo va en la fila de `FilterBar` (`action`). | Decisión del usuario: la misma señal y el mismo submenú en todas partes, y el botón alineado con los filtros. |
