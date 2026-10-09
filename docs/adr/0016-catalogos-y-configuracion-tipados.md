# ADR-0016: Catálogos y configuración en tablas tipadas

**Estado:** Propuesta · **Fecha:** 2026-10-09

## Contexto
Los requerimientos piden trece parámetros administrables (PM1 a PM13) y una configuración general de la empresa. Se pueden modelar con una tabla genérica (columna `kind` para los catálogos, clave-valor para la configuración) o con tablas propias. El proyecto debe seguir buenas prácticas de normalización: cada dato en su sitio, sin duplicar información y con la integridad garantizada por la base de datos. Decisión del usuario.

## Decisión
- **Cada catálogo tiene su propia tabla** (`contact_types`, `client_statuses`, `segments`, `tax_regimes`, `payment_methods`, …). Son pocas (trece) y cada una conserva su integridad referencial y puede tener columnas propias.
- **El código sí es genérico:** un solo repositorio y un solo controlador parametrizados por tabla sirven el CRUD de todos los catálogos. No se repite código aunque se repitan tablas.
- **La configuración general se divide por tema en tablas de una sola fila con columnas tipadas** (`company_profile`, `financial_settings`, `security_settings`, `mail_settings`); la numeración va en `number_sequences`. Una tabla de una sola fila se fuerza con una columna `singleton ENUM('1') NOT NULL UNIQUE`.
- Un ajuste nuevo es una migración (Phinx ya las automatiza en cada instancia).

## Alternativas descartadas
- **Tabla genérica con `kind`:** la base no impide que un cliente apunte a un valor de otro tipo, no admite columnas propias y todas las consultas filtran por `kind`.
- **Configuración clave-valor:** sin tipos ni límites en la base, valores como texto y una auditoría menos clara.

## Consecuencias
- Más tablas, pero homogéneas, y un ajuste nuevo exige migración y despliegue.
- Los límites (por ejemplo `0 ≤ tasa < 1`) se validan en el código, porque MySQL 5.7 ignora las restricciones `CHECK`.
