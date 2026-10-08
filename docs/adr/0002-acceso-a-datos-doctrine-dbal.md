# ADR-0002: Acceso a datos con Doctrine DBAL, sin ORM

**Estado:** Aceptada · **Fecha:** 2026-10-08

## Contexto
El sistema maneja dinero, borrado lógico, unicidad entre activos y numeración a prueba de concurrencia. Necesitamos control sobre el SQL y los tipos, con poco consumo de recursos.

## Decisión
**Doctrine DBAL** (query builder y tipos `DECIMAL`) con un repositorio por agregado. Sin ORM. Las transacciones y `SELECT … FOR UPDATE` se usan para la numeración de documentos.

## Alternativas descartadas
- **RedBeanPHP:** su modo fluido altera el esquema por su cuenta, lo que choca con las migraciones versionadas, e infiere tipos (los decimales pueden quedar como `DOUBLE`).
- **Eloquent standalone:** más productivo, pero más pesado y acopla la lógica de negocio a los modelos.
- **Doctrine ORM:** demasiado pesado para este hosting.

## Consecuencias
- Hay que escribir los repositorios a mano (más código, más control).
- Al instalar, verificar que la versión de DBAL elegida soporte MySQL 5.7 y PHP 8.3.
