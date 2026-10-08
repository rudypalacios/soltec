# ADR-0011: Cálculo de precios

**Estado:** Aceptada (precisada por [ADR-0014](0014-el-servidor-calcula-los-precios.md)) · **Fecha:** 2026-10-08

## Contexto
El legacy calcula el precio de venta a partir del costo del producto y de un nivel de margen (MC) elegido al consultar el producto. La fórmula fue confirmada y reproduce exactamente los valores del legacy (verificado con tres productos reales). El costo registrado es el de la factura del proveedor, es decir, **con IVA**.

## Decisión
Fórmula, con IVA, ISR y MC como parámetros (nunca valores fijos en el código):

```
sin_iva = ((costo / (1 + IVA)) / (1 − MC)) / (1 − ISR)
con_iva = sin_iva × (1 + IVA)
```

- El MC es un margen sobre el precio de venta, no un recargo sobre el costo. Validación: `0 ≤ MC < 1` y `0 ≤ ISR < 1`.
- Valores iniciales: IVA 12%, ISR 3% (el valor del legacy; es configurable) y los niveles de margen del legacy.
- El precio de catálogo **no se guarda**: se calcula desde el costo y el nivel elegido. El precio de un paquete es la suma de los precios de sus componentes, calculada en el momento (con un mismo MC, la fórmula es lineal en el costo).
- **Redondeo:** se calcula sin redondear; se redondea a 2 decimales al mostrar o al cerrar una línea de documento; el IVA de un documento se calcula sobre su total. Dinero en `DECIMAL`.
- **Cotizaciones:** cada línea guarda una copia del precio, el nivel de margen, las tasas usadas y, en paquetes, la composición. La cotización tiene una validez configurable (15 días por defecto) y una cotización nueva toma los precios vigentes.

## Casos de prueba de aceptación
Con IVA 12%, ISR 3% y MC 33%:

| Costo | Sin IVA | Con IVA |
|-------|---------|---------|
| 1.25 | 1.72 | 1.92 |
| 22.96 | 31.54 | 35.33 |
| 525.01 | 721.28 | 807.83 |

El IVA se calcula sobre el precio sin redondear (por eso 31.54 × 1.12 no da 35.33 en pantalla). La función de precio es pura y vive en `shared/`, con estos casos como pruebas.

## Alternativas descartadas
- Guardar el precio en el producto: se desactualiza al cambiar costo, IVA, ISR o MC.
- Recargo sobre el costo (`costo × (1 + MC)`): no coincide con el legacy.

## Consecuencias
- Cambiar IVA, ISR o un nivel de margen cambia los precios de catálogo al instante, y no afecta cotizaciones ya emitidas.
- Una política de redondeo distinta a la del legacy mostraría diferencias de centavos en totales; la regla de arriba es la que se aplica a documentos nuevos.
