# ADR-0023: Desactivación, referencias y cascada

**Estado:** Aceptada · **Fecha:** 2026-10-12

## Contexto
Nada se elimina: se desactiva (`deleted_at`). Esa palabra significa lo mismo en toda la plataforma y es independiente de cualquier estado de negocio (por ejemplo «Perdido» en un cliente). Falta decir qué pasa con lo que apunta a un registro desactivado.

## Decisión
- **Valor de catálogo desactivado** (marca, segmento, régimen, unidad…): no bloquea ni arrastra nada. Los registros que ya lo usan lo conservan; los formularios ofrecen solo valores activos más el que el registro ya tenía.
- **Padre con hijos activos** (área con grupos, categoría de unidades con unidades): no se desactiva. `409` con el conteo, como `department_in_use`.
- **Quien es referenciado por trabajo vivo:** no se desactiva un usuario que es el asesor responsable de clientes activos (`409 user_has_clients`) ni un nivel de margen que es el habitual de clientes activos (`409 margin_level_in_use`). Antes se reasigna la cartera.
- **Cascada proveedor → productos:** al desactivar un proveedor se desactivan sus productos activos en la misma transacción, con `deactivation_reason = 'supplier'` y una entrada de auditoría por producto. Un producto desactivado a mano lleva `manual`.
- **Reactivación:** reactivar un proveedor **no** reactiva sus productos; la respuesta informa cuántos quedaron inactivos por él. Se reactivan en bloque (los de motivo `supplier`) o uno a uno. Un producto no se reactiva mientras su proveedor esté inactivo.
- **Acciones en bloque:** desactivar y reactivar varios productos (hasta 500 `ids`, o todos los de un proveedor) en una transacción, con auditoría por producto.
- **Vínculos** (`client_contacts`, `bundle_items`, `client_sellers`…): quitar un vínculo lo borra de la tabla de unión y queda en la auditoría. Las entidades que une nunca se borran.
- **Quién avisa a quién:** el módulo dueño de la tabla referenciada no importa clases del que la referencia. Define un puerto (`DeactivationGuard` para bloquear, `DeactivationCascade` para arrastrar) que implementa el módulo que referencia, y el contenedor los conecta. `Organization` y `Access` ya consultan la tabla directamente, y se mantienen así.

## Alternativas descartadas
- **Bloquear siempre que haya referencias:** un segmento desactivado impediría editar cualquier cliente que lo use.
- **Cascada también al reactivar:** reactivaría productos que alguien desactivó a propósito.
- **Que el módulo del proveedor consulte la tabla de productos:** crea una dependencia circular.

## Consecuencias
- Cada regla de bloqueo tiene su prueba y su error con el conteo, para que la pantalla diga por qué.
- Con miles de productos, la cascada es un `UPDATE` más un `INSERT … SELECT` de auditoría en una transacción; se prueba con un volumen realista.
- El proveedor se bloquea (`FOR UPDATE`) al crear o editar un producto, para que no entre uno nuevo durante la cascada.
