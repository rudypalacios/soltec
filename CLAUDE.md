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
- **Frontend web:** React + TypeScript, desktop-first.
- **Móvil:** PWA (Android e iOS) con offline y sincronización posterior. Ver 1.1 para dejar la puerta abierta a Expo.
- **Base de datos:** MySQL (provisional, P15; confírmalo en el Hito 0 antes del ERD).
- **Migraciones:** esquema versionado con Phinx (o equivalente). Todo cambio de esquema es una migración; nunca se edita la base a mano.
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
- Commits y PR explican el *por qué*. Los cambios que afectan cómo se corre o estructura el proyecto actualizan el README en el mismo cambio.

## 2. Hito 0 — Planeación (antes de programar funcionalidades)

Genera estos 5 entregables, **uno a la vez, deteniéndote para revisión después de cada uno**. El ERD es el que más debe revisarse con calma.

1. **Mapa de módulos y matriz de dependencias** (qué módulo requiere a cuál). Úsala para validar el orden de los hitos y propón ajustes si algo está mal ordenado.
2. **ERD:** entidades, cardinalidades, PK/FK, índices y campos de sync. Cubre al menos: usuarios y roles, parámetros PM, contactos, clientes (prospecto y venta), proveedores, productos y combos, bodegas, cotizaciones, plantillas de tipo de proyecto (etapas/actividades), proyectos, tareas, solicitudes de compra y OC, facturación, CXC/CXP.
3. **Estructura del repositorio** (`api/`, `web/`, `mobile/`, `shared/`, `docs/`, migraciones).
4. **Especificación OpenAPI** de los hitos 1 a 3.
5. **Esqueleto de autenticación y roles:** roles y permisos **como datos configurables** (no hardcodeados), permisos granulares por módulo, JWT con refresh.

No avances a código de funcionalidades hasta que estos 5 existan y estén revisados.

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
| Antes de producción | P14 (normativa de datos) |

El detalle de P1 a P16 y el Anexo A de propuestas están en el documento de requerimientos; P17 a P23 están en `docs/arquitectura/mapa-de-modulos.md`.

## 7. Entorno de ejecución y reglas de sesión

> Cada sesión nueva arranca sin memoria de las anteriores. Lo que importa vive en el repo: este archivo y `docs/` (requerimientos, `docs/adr/`, `docs/arquitectura/`). Léelos al empezar.

- **Dónde corres.** Claude Code en la web, dentro de un *environment* configurado por el usuario: un contenedor en la nube, efímero, con sus repositorios, variables y secretos, política de red y script de setup. Lo que no se commitea y se sube a GitHub se pierde cuando termina la sesión.
- **Si algo no se puede alcanzar** (un host bloqueado por la red del environment, un secreto o variable que falta, una herramienta que no está instalada, un permiso de GitHub), normalmente se puede configurar. No lo rodees en silencio: avisa al usuario qué falta y dale los pasos concretos. Los pasos vigentes están en la documentación del environment (herramienta `read_documentation`).
- **Ramas.** Toda rama sale de `main` actualizada, salvo que el usuario indique otra base. No se trabaja directo en `main`. **Nunca se hace push a una rama cuyo PR ya fue fusionado:** se reinicia desde `main` (`git fetch origin main && git checkout -B <rama> origin/main`, conservando el nombre de rama que designe la sesión) y el trabajo nuevo va en un PR nuevo.
- **Pull requests.** Cuando consideres terminado el trabajo y quieras que el usuario lo revise, crea el PR de inmediato contra `main`, sin esperar a que lo pida; el cuerpo explica el porqué del cambio. Aplica también a cada entregable del Hito 0: el PR se crea en el punto en que te detienes para revisión.

## 8. Registro de decisiones técnicas de Claude

Las decisiones técnicas menores que Claude toma sin consultar (nomenclatura, estructura interna, herramientas de apoyo) se anotan aquí con fecha y motivo. Las decisiones grandes o difíciles de revertir se consultan al usuario y se registran como ADR en `docs/adr/`.

| Fecha | Decisión | Motivo |
|-------|----------|--------|
| 2026-10-08 | Las preguntas nuevas continúan la numeración del documento de requerimientos (P17 en adelante) y viven en `docs/arquitectura/mapa-de-modulos.md`. | Evita editar el documento de requerimientos, que es la fuente funcional. |
| 2026-10-08 | Las secciones 2 a 5 del mapa de módulos se generan con `docs/arquitectura/herramientas/generar_mapa.py` (`python3 -I generar_mapa.py salida.md`). | Tabla, matriz y diagrama salen de una sola fuente y el script valida que ninguna dependencia dura apunte a un hito posterior. |
