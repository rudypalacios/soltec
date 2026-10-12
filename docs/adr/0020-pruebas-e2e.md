# ADR-0020: Pruebas E2E con Playwright contra un servidor desechable

**Estado:** Aceptada · **Fecha:** 2026-10-12

## Contexto
Las pruebas unitarias y de integración no cubren que la web, la API y la base de datos funcionen juntas (por ejemplo, sesión, bloqueo y auditoría de punta a punta). El QA manual de Claude en `staging` no es repetible, y `staging` es compartido y envía correo real.

## Decisión
- **Playwright** (no Cypress): ya está en el environment, prueba varios navegadores y simula bien el móvil.
- **Servidor desechable**, nunca `staging`: MySQL 5.7, la API (`php -S`), la web ya construida (`vite preview`, con el mismo origen único) y un **buzón de prueba** (`e2e/support/mail-sink.ts`: SMTP en memoria y una API HTTP para leer los correos). Así se prueban invitaciones y recuperación sin correo real, y sin tocar el código de producción (no hay un driver de correo «de pruebas»).
- **Cuándo corre** (`.github/workflows/e2e.yml`): en un PR hacia `develop` solo lo **nuevo o cambiado** (`--only-changed=origin/develop`); al caer en `develop`, **todo** (regresión). `main` no vuelve a correrlo: ya pasó en `develop`.
- **Qué se agrega:** solo lo que no se quiere roto, un escenario corto por comportamiento. Cada PR trae su escenario o ajusta el existente; el CI no lee el código de la aplicación para adivinar qué probar (`--only-changed` mira solo los archivos de `e2e/`).
- **Estructura atómica en `e2e/`:** `componentes/` (un locator, una intención: `DataTable`), `paginas/` (objetos de página), `flujos/` (pasos de negocio como `signIn`), `pruebas/` (escenarios). Locators por rol y nombre accesible, nunca por CSS; las aserciones van en las pruebas, no en las páginas. Los datos se preparan **por API** (`support/api.ts`) con nombres únicos, así los escenarios corren en paralelo.
- Cada escenario es independiente y no limpia: la base se recrea en cada corrida (`support/reset-database.php`, que solo acepta nombres terminados en `_e2e`).

## Alternativas descartadas
- **Correr el E2E contra `staging`:** es compartido, envía correo real y no permite bloquear cuentas ni invitar sin consecuencias. Queda, aparte, el QA de Claude con la cuenta `qa-`.
- **Un driver de correo `file` en la API:** código de producción solo para pruebas; el buzón SMTP ejercita el mismo camino que usa la instancia real.
- **Correr todo el E2E en cada PR:** crece con cada rebanada y alarga el ciclo; la regresión completa en `develop` basta.

## Consecuencias
- Lo que sigue siendo manual: que un correo llegue a una bandeja real, un teléfono físico y la revisión visual.
- `php -S` no llena `$_ENV` (la API lee ahí su configuración): se arranca con `-d variables_order=EGPCS`.
- La infraestructura corre en Chromium de escritorio; el proyecto móvil (390 px) y WebKit se agregan cuando un escenario lo necesite.
