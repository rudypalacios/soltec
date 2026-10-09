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
- **Ramas.** Cada PR usa una **rama nueva**, creada desde `main` actualizada con `git fetch --prune origin main && git checkout -B <rama> origin/main`, y con un nombre descriptivo del cambio: `<tipo>/<tema>` (por ejemplo `docs/reglas-de-ramas`, `hito-0b/scaffolding`, `hito-1/autenticacion`). Se sube con `git push -u origin <rama>`, sin forzar, porque es nueva. No se trabaja directo en `main`, salvo que el usuario indique otra base. La rama que designe la sesión puede usarse para el primer cambio; los siguientes van en ramas nuevas.
- **Un cambio, un PR.** Los cambios de naturaleza distinta, aunque sean del mismo alcance (por ejemplo una regla del proceso y un entregable de arquitectura), van en ramas y PR separados, cada uno saliendo de `main`. Si en una misma sesión surgen varios, se crea una rama por cada uno y se vuelve a `main` entre ellos.
- **Una rama fusionada se borra y no se reutiliza:** ni su historial ni su nombre. Nunca se hace push a una rama cuyo PR ya fue fusionado. El `--prune` evita que la copia local apunte a una rama remota que GitHub ya borró.
- **Squash and merge.** Los PR se fusionan siempre con *squash and merge*: cada rama entra a `main` como un solo commit, y los commits de la rama no quedan como ancestros de `main`. Por eso:
  - Antes de empezar a trabajar y antes de cada push: `git fetch origin main && git rebase origin/main`. Si la rama ya estaba subida, el push es `git push --force-with-lease`. No se hace merge de `main` a la rama: el historial se mantiene lineal.
  - No se apilan ramas sobre otra rama sin fusionar. Si un trabajo depende de un PR abierto, se espera su merge; si hay que adelantarse, al fusionarse el PR base se corta con `git rebase --onto origin/main <último commit del PR base>`.
  - El título del PR pasa a ser el mensaje del commit en `main`, junto con su descripción o la lista de commits según la configuración del repo: escríbelos como mensaje final (el porqué) y mantenlos actualizados si el PR cambia.
- **Pull requests.** Cuando consideres terminado el trabajo y quieras que el usuario lo revise, crea el PR de inmediato contra `main`, sin esperar a que lo pida; el cuerpo explica el porqué del cambio. Aplica también a cada entregable del Hito 0: el PR se crea en el punto en que te detienes para revisión.
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
| 2026-10-09 | **La documentación solo recoge lo técnico, lo lógico o lo que exige mucho conocimiento;** no se anota todo lo que el usuario dice ni lo evidente. Las respuestas en la sesión son cortas: solo los puntos relevantes. | Decisión del usuario: demasiado texto que leer. |
