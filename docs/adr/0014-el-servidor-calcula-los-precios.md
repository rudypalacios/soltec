# ADR-0014: El servidor calcula los precios; `shared/` solo los previsualiza

**Estado:** Aceptada · precisa a [ADR-0011](0011-calculo-de-precios.md) · **Fecha:** 2026-10-08

## Contexto
El ADR-0011 dice que la función de precio es pura y vive en `shared/`. Pero el precio que se congela en una cotización (y el que se muestra en el catálogo) tiene que calcularlo el servidor: es la fuente de verdad, y el cliente no es de fiar. Si solo existiera la versión TypeScript, el servidor no podría congelar precios por sí mismo.

## Decisión
- **El servidor (PHP) calcula** todo precio que se muestra como definitivo o se guarda: catálogo, líneas de cotización y paquetes.
- `shared/` conserva una versión TypeScript de la misma función **solo para vista previa inmediata** en la interfaz (por ejemplo, el simulador de niveles de margen mientras se escribe).
- Ambas implementaciones se prueban con **los mismos vectores** (`contract/test-vectors/`): PHPUnit y Vitest leen el mismo archivo, con los tres casos del ADR-0011 y los límites de validación.
- Si los resultados difieren, manda el del servidor.

## Implementación
- Sin `float` ni `bcmath` (el hosting no garantiza la extensión): PHP hace división larga con enteros y TypeScript usa `BigInt`; ambos redondean a centavos una sola vez, mitad hacia arriba.
- El IVA se cancela en `con_iva = costo / ((1 − MC) × (1 − ISR))`, así que cada monto es una sola división.
- Límites compartidos (en los vectores): costo de hasta 9 enteros y 4 decimales; un precio de 10^13 o más se rechaza (`price_too_large`).

## Alternativas descartadas
- **Solo TypeScript en `shared/`:** el servidor no puede congelar precios por su cuenta.
- **Solo PHP, sin vista previa en el cliente:** cada cambio de margen en el simulador exigiría una petición.

## Consecuencias
- La fórmula existe en dos lenguajes. El riesgo de que diverjan se contiene con los vectores compartidos en el CI.
- Cualquier cambio de la fórmula exige actualizar los vectores primero.
