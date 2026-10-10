# ADR-0008: Interfaz web con MUI

**Estado:** Aceptada · **Fecha:** 2026-10-08

## Contexto
El cliente tomó como referencia la diagramación y los colores de Gmail y de StelOrder: cómoda, práctica, a la vista.

## Decisión
**MUI (Material UI)** con un tema propio (paleta, tipografía, densidad) definido como tokens. Tablas con TanStack Table o las de MUI. El tema se afina con la skill de diseño de frontend. Antes de cerrar, una pantalla de muestra (lista y formulario) para aprobación del cliente. El afinado y sus tokens están en el [ADR-0018](0018-identidad-visual-y-tema.md).

## Alternativas descartadas
- **Ant Design:** excelente en tablas y formularios, más pesado.
- **Mantine:** más ligero, menor afinidad con el look pedido.
- **shadcn/ui + Tailwind:** más control, más trabajo.

## Consecuencias
- La app móvil (`mobile/`) no comparte componentes visuales con web; comparte tipos, validaciones y lógica de `shared/`.
- Funciones avanzadas de la grilla de datos de MUI son de pago: no se usan.
