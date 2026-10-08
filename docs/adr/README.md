# Decisiones de arquitectura (ADR)

Cada ADR registra **una** decisión técnica: qué se decidió, por qué y qué costo tiene. Se numeran en orden y no se editan para cambiar de opinión: si una decisión cambia, se escribe un ADR nuevo que reemplaza al anterior.

**Estados:** `Propuesta` (falta confirmar), `Aceptada`, `Reemplazada por ADR-NNNN`.

**Estructura:** Contexto · Decisión · Alternativas descartadas · Consecuencias.

| # | Decisión | Estado |
|---|----------|--------|
| [0001](0001-stack-base.md) | Stack base: PHP 8.3, Slim 4, MySQL 5.7 | Aceptada |
| [0002](0002-acceso-a-datos-doctrine-dbal.md) | Acceso a datos con Doctrine DBAL, sin ORM | Aceptada |
| [0003](0003-migraciones-phinx-por-endpoint.md) | Migraciones con Phinx ejecutadas por endpoint | Aceptada |
| [0004](0004-despliegue-ftps-github-actions.md) | Despliegue por FTPS con GitHub Actions | Propuesta |
| [0005](0005-actualizaciones-por-polling.md) | Actualizaciones por polling | Aceptada |
| [0006](0006-contrato-openapi-y-validaciones.md) | OpenAPI como fuente única de validaciones | Propuesta |
| [0007](0007-pdf-con-dompdf.md) | PDFs con Dompdf | Aceptada |
| [0008](0008-ui-con-mui.md) | Interfaz web con MUI | Aceptada |
| [0009](0009-archivos-e-imagenes.md) | Archivos locales e imágenes en WebP | Aceptada |
| [0010](0010-email-smtp-por-instancia.md) | Email por SMTP configurable por instancia | Reemplazada parcialmente por 0013 |
| [0011](0011-calculo-de-precios.md) | Cálculo de precios (fórmula, redondeo, congelamiento) | Aceptada |
| [0012](0012-autenticacion-y-autorizacion.md) | Autenticación y autorización | Aceptada |
| [0013](0013-envio-de-email.md) | Envío de email: SMTP autenticado, `mail()` como plan B | Aceptada |
