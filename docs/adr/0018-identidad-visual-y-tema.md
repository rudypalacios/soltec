# ADR-0018: Identidad visual, tokens del tema y componentes compartidos de la web

**Estado:** Aceptada (la muestra de usuarios fue aprobada el 2026-10-10) · **Fecha:** 2026-10-10

## Contexto
El ADR-0008 fijó MUI y dejó pendiente afinar el tema (paleta, tipografía, densidad). Al empezar el afinado había tres problemas:
- La fuente del tema era Roboto, pero nada la cargaba (ni `<link>` ni paquete): la app se veía en Helvetica o Arial según el equipo.
- Los controles táctiles de 44 px se activaban por ancho de ventana (`down('md')`), no por tipo de puntero: una tableta táctil en horizontal quedaba con controles de escritorio.
- Usuarios, perfiles y departamentos repetían cada uno la barra de filtros, la tabla, las tarjetas de móvil, la paginación y el indicador de estado.

## Decisión
- **Dirección «tinta y azul Soltec».** Superficies claras y grisáceas, menú lateral claro con el elemento activo en píldora (el gesto de Gmail que pidió el cliente) y un primario tomado del azul del logo (`#0B6BB0`, más oscuro que el `#0080C8` del logo porque ese no llega a 4,5:1 como texto). Sin sombras en tarjetas y tablas: borde. El estado de un registro se muestra como punto más palabra, no como chip con borde.
- **Tokens en un solo archivo** (`web/src/theme/tokens.ts`): color, familia tipográfica, radios (6 en controles, 12 en superficies) y alturas. `theme.ts` solo los arma. Una prueba (`theme.test.ts`) comprueba el contraste de los pares que se usan juntos (4,5:1 texto, 3:1 bordes de campos y marcas).
- **Tipografía:** IBM Plex Sans autoalojada con `@fontsource-variable/ibm-plex-sans`, solo los subconjuntos `latin` y `latin-ext` (76 KB en total; el español cabe en `latin`). Sin CDN. `font-display: swap`; el nombre con hash del archivo permite cachearla para siempre tras la primera visita. Cifras tabulares en toda la app.
- **Densidad:** 14 px y campos de 40 px en escritorio; 16 px (iOS no hace zoom al enfocar un campo), campos de 48 px y controles de 44 px cuando el puntero es táctil **o** la ventana es angosta: `@media (pointer: coarse), (max-width: 899.95px)`. El cambio de diseño (tabla ↔ tarjetas, menú lateral ↔ cajón) sigue siendo por ancho (`useIsMobile`).
- **Componentes compartidos** en `web/src/components/`, extraídos de lo que ya se repetía tres veces: `DataList` (tabla desde `md`, tarjetas debajo; cada columna declara su papel en la tarjeta), `RowActions`, `FilterBar` con `useListFilters`, `StatusBadge`, `FormPage` y `FormActions`, y `StatusFilter` (que salió de `modules/access` porque lo importaba también Organización).
- **Las acciones de fila** van en un menú ⋮ en toda tabla, tengan una o cinco, para que todas se vean igual y la columna no crezca con cada acción nueva; en las tarjetas de móvil la primera acción es un botón de 44 px a la vista y las demás van en el ⋮ del mismo pie, siempre en una sola fila (con botones sueltos, tres acciones saltaban de línea y la tarjeta se veía desordenada; el patrón no cambia según cuántas acciones haya, para que las tarjetas de una lista sean iguales). El nombre accesible incluye la fila: «Editar: Ana». (Se probó mostrar botones de texto cuando caben dos y el menú cuando son tres o más, pero dos tablas con patrones distintos confundían.) **Confirmar antes de actuar:** desactivar, reactivar y reenviar una invitación piden confirmación; el botón de confirmar es rojo solo si la acción es destructiva (`destructive`).
- **Cada acción de fila lleva icono** (editar, ver, renombrar, reenviar, desactivar, reactivar), en el menú ⋮ (18 px y en gris, para que no pesen más que la palabra) y en los botones de las tarjetas, tomado de `components/actionIcons.tsx` para que la misma acción se vea igual en todas las listas. El icono es decoración: el texto sigue diciendo qué hace y el nombre accesible no cambia.
- **El botón secundario** (Cancelar, Volver) es un contorno neutro, no un enlace de texto: se reconoce como botón y se distingue del principal, que va relleno. El texto sin contorno queda para acciones dentro de una tarjeta o fila.
- **La paleta es del producto, no de una empresa.** El logo y el nombre de cada instancia llegan con la configuración (rebanada 1.3). `Brand` dibuja una marca provisional (arco de puntos y el nombre) hasta tener el logo vectorial.

## Alternativas descartadas
- **Gmail fiel (azul `#1a73e8`, Roboto):** es lo que pidió el cliente casi al pie de la letra, pero es el MUI de fábrica y no se distingue de otro panel.
- **Menú lateral oscuro estilo StelOrder:** navegación de mucho contraste, pero es el patrón más común de los paneles y pesa más en el cajón móvil.
- **Jade como primario:** se propuso antes de conocer el logo; se descartó al ver que el cliente ya tiene un azul.
- **Fuente del sistema o CDN de fuentes:** la primera se ve distinta en cada equipo; la segunda añade una dependencia externa y no sirve para la PWA sin conexión.
- **TanStack Table para `DataList`:** las listas actuales no ordenan por columna ni seleccionan filas; se adopta cuando haga falta (YAGNI).

## Consecuencias
- Cambiar un color o una altura es tocar `tokens.ts`; la prueba de contraste avisa si un par deja de leerse.
- Una pantalla de lista nueva declara columnas y acciones, no tablas ni tarjetas. Si una pantalla necesita algo que `DataList` no da (ordenar, seleccionar, filas expandibles), se amplía el componente en vez de copiarlo.
- Modo oscuro, ordenar columnas y tematizar por empresa quedan fuera; el tema por empresa llega, si hace falta, con la configuración.
- Todas las pantallas usan ya el tema y los componentes: usuarios, perfiles y departamentos (`DataList`), los formularios (`FormPage`) y las pantallas públicas (`PublicCard` con la marca). Una pantalla nueva que no los use es una excepción que se explica en su PR.
