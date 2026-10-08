# ADR-0001: Stack base: PHP 8.3, Slim 4, MySQL 5.7

**Estado:** Aceptada · **Fecha:** 2026-10-08

## Contexto
El hosting inicial es OrangeHost (cPanel): PHP seleccionable (ya en 8.3), MySQL 5.7.41, `mod_rewrite` activo, solo FTPS (sin SSH). Es posible una mudanza futura a DreamHost, donde Node no está disponible, así que el backend no puede depender de procesos persistentes. Debe ser ligero: el plan tiene pocos recursos.

## Decisión
- Backend: **PHP 8.3** con **Slim 4**, API REST sin vistas.
- Frontend: React + TypeScript. Móvil: PWA.
- Base de datos: **MySQL 5.7**, escribiendo SQL del subconjunto común con MySQL 8.0 para que la mudanza no cueste.
- Unicidad entre registros activos (NIT, códigos) con **columna generada** + índice único, porque 5.7 no tiene índices parciales ni funcionales. Ejemplo: `nit_activo = IF(deleted_at IS NULL, nit, NULL)`.

## Alternativas descartadas
- PostgreSQL: no está disponible en el hosting.
- Backend en Node: no es portable entre OrangeHost y DreamHost.

## Consecuencias
- MySQL 5.7 no recibe soporte desde octubre de 2023. Riesgo aceptado; se migra a 8.0 al cambiar de hosting.
- No se usan CTE, funciones de ventana ni `SKIP LOCKED`.
- Los tests en CI corren contra un MySQL 5.7 (servicio de GitHub Actions), no hay Docker local.
