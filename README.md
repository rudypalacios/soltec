# Soltec: CRM-ERP

Sistema CRM-ERP por instancia (una empresa por instalación). La web (React) y la API (PHP) se sirven bajo el mismo origen: la web en `/` y la API en `/api/v1`.

- **Cómo se trabaja y qué se construye:** [`CLAUDE.md`](CLAUDE.md), [`TODO.md`](TODO.md) y [`docs/`](docs/).
- **Estructura del repositorio:** [`docs/arquitectura/estructura-del-repositorio.md`](docs/arquitectura/estructura-del-repositorio.md).
- **Decisiones técnicas:** [`docs/adr/`](docs/adr/).

## Requisitos

PHP 8.3 con `pdo_mysql`, `mbstring`, `intl` y `gd`; Composer; Node 22; MySQL 5.7 u 8.0.

## Desarrollo local

```bash
# API
cd api
composer install
cp .env.example .env            # y completa DB_NAME, DB_USER, DB_PASS y DEPLOY_TOKEN
cd ..
php -S 127.0.0.1:8080 -t api/public api/public/index.php

# Migraciones (con el servidor anterior encendido)
curl -X POST -H "X-Deploy-Token: $DEPLOY_TOKEN" http://127.0.0.1:8080/api/system/migrations/apply

# Web (en otra terminal; reenvía /api al puerto 8080)
npm install
npm run dev                     # http://localhost:5173
```

## Pruebas y calidad

| Qué | Comando |
|---|---|
| API: estilo, análisis estático y pruebas | `cd api && composer check` |
| Web y `shared`: lint, contrato, tipos, pruebas y build | `npm run lint && npm run lint:contract && npm run typecheck && npm test && npm run build` |

Las pruebas de integración de la API borran todas las tablas de la base de datos configurada, por eso exigen que su nombre termine en `_test` (por defecto `soltec_test`, ver `api/phpunit.xml`).

## Contrato de la API

`contract/openapi.yaml` es la fuente única. Los tipos y el cliente de `shared/` se generan con `npm run generate` (no se versionan) y una prueba de la API falla si una ruta `/v1` no está en el contrato o al revés. Los endpoints de despliegue (`/api/system/*`) quedan fuera del contrato público.

## Despliegue

Ver [ADR-0003](docs/adr/0003-migraciones-phinx-por-endpoint.md) y [ADR-0004](docs/adr/0004-despliegue-ftps-github-actions.md). La guía paso a paso llega con el flujo de despliegue.
