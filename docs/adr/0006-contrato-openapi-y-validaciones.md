# ADR-0006: OpenAPI como fuente única de validaciones

**Estado:** Aceptada, recortada (2026-10-12) · **Fecha:** 2026-10-08

## Contexto
Las reglas de datos se validan en el navegador (Zod, para avisar rápido) y en el servidor (seguridad). Escribirlas dos veces hace que diverjan.

## Decisión
- **El contrato OpenAPI es la fuente única de rutas, formas de petición y respuesta, permisos (`x-permission`) y errores.** Se edita junto con el código de cada endpoint.
- De él se generan el cliente tipado y los tipos TypeScript de `shared/` (`openapi-typescript`). Una prueba de la API falla si una ruta `/v1` no está en el contrato o al revés.
- **Las validaciones de datos se escriben en el servidor** (PHP, con sus pruebas). Zod en `shared/` aparece solo cuando una pantalla necesite validar antes de enviar, y entonces se deriva del contrato.
- **Recortado el 2026-10-12** respecto de la propuesta original: no hay middleware PHP que valide cada petición contra el contrato, ni esquemas Zod generados, ni Swagger UI. Se retoman si el costo de validar a mano en cada controlador supera el de montarlos (YAGNI).

## Alternativas descartadas
- Escribir Zod y validaciones PHP por separado, sincronizadas con tests: duplica el trabajo y el riesgo de divergencia.

## Consecuencias
- La generación de tipos y cliente corre en CI; las herramientas ya están elegidas.
- Reglas muy específicas del negocio que OpenAPI no expresa quedan en código, con tests.
