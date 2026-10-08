# ADR-0006: OpenAPI como fuente única de validaciones

**Estado:** Propuesta · **Fecha:** 2026-10-08

## Contexto
Las reglas de datos se validan en el navegador (Zod, para avisar rápido) y en el servidor (seguridad). Escribirlas dos veces hace que diverjan.

## Decisión
- Cada regla se escribe **una vez en el contrato OpenAPI**.
- De él se generan el cliente tipado, los tipos TypeScript y los esquemas Zod de `shared/`.
- En PHP, un middleware valida cada petición contra el mismo contrato.
- Swagger UI como documentación navegable.
- El contrato se edita antes que el código de cada endpoint.

## Alternativas descartadas
- Escribir Zod y validaciones PHP por separado, sincronizadas con tests: duplica el trabajo y el riesgo de divergencia.

## Consecuencias
- Hay que montar la generación de código en CI y elegir herramientas concretas (por decidir al armar el entregable de OpenAPI).
- Reglas muy específicas del negocio que OpenAPI no expresa quedan en código, con tests.
