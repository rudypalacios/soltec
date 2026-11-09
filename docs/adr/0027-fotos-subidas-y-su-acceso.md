# ADR-0027: Fotos subidas: quién las ve y cómo viajan

**Estado:** Aceptada · **Fecha:** 2026-11-09

## Contexto
El ADR-0009 fijó el almacenamiento local, los dos WebP y los metadatos en JSON. Faltaba decir cómo se sube una foto, quién la puede ver antes de que un registro (tarea, ticket, comentario) la adopte, y cómo la pide el navegador, que no puede mandar el token en una etiqueta de imagen.

## Decisión
- **Subida:** `POST /v1/files` con un formulario multipart (`file`, `id` opcional, `metadata` opcional como texto JSON). El archivo se identifica por su contenido (JPEG, PNG o WebP), se decodifica y se vuelve a codificar siempre, hasta 10 MB y 16 megapíxeles. Lo que traía el archivo más allá de la imagen no se conserva.
- **Id del cliente:** el `id` lo elige quien sube (UUID v7). La misma foto con el mismo id y de la misma persona responde `200` con lo ya guardado; cualquier otro uso de un id existente es `409`. Así un reintento, o un teléfono sin conexión que manda después, no duplica la foto (CLAUDE.md §1.1, punto 4).
- **Dueño y alcance:** el dueño de un archivo es quien lo subió, y el recurso `files` tiene alcance (propio, equipo, todo) como `contacts`. Mientras ningún registro adopte la foto, nadie más necesita verla. Cuando lleguen tareas y tickets, **quien puede ver el registro verá sus fotos** además de lo que le da `files`: esa regla la agrega el primer módulo que adopte fotos, con su propio puerto, sin tocar esta tabla.
- **Metadatos:** una lista fija (`taken_at`, `latitude`, `longitude`, `device_make`, `device_model`), con las coordenadas juntas o ninguna, hasta 8 KB. El navegador lee el EXIF antes de reducir la foto y envía solo eso.
- **Lectura:** `GET /v1/files/{id}/content?size=normal|thumbnail` lleva `ETag` y `Cache-Control: private, no-cache`: el navegador revalida en cada uso, así que quien pierde el acceso, o una foto desactivada, deja de recibirla al instante, y la foto sin cambios cuesta un `304`. El navegador la pide con `fetch` y la muestra como `blob:`.
- **Desactivar:** deja de servir la foto, pero los archivos se quedan en disco (nada se borra). No hay reactivar hasta que alguien lo pida.
- **Puerto de almacenamiento:** `FileStorage` con una implementación local; el nombre en disco sale del id (nada del cliente llega a la ruta) y solo se resuelven rutas que esa clase escribió.

## Alternativas descartadas
- **Cuerpo `PUT` con la imagen** (como el logo): no hay dónde poner los metadatos ni el nombre sin inventar encabezados.
- **Servir las imágenes públicas con un nombre difícil de adivinar:** quien tenga el enlace la ve para siempre, y el portal de clientes (Hito 9) necesita revocar.
- **URL firmadas de corta vida:** otro mecanismo de firmas para resolver algo que el `fetch` con token ya resuelve.
- **Conservar el original:** pesa de 3 a 5 veces más y el hosting tiene espacio limitado (ADR-0009).

## Consecuencias
- Una foto subida que nadie adopta queda en disco: es poco, y la limpieza de pendientes antiguos queda anotada para cuando haya datos reales.
- Cada miniatura de una lista es una petición con token; con listas de decenas de fotos es aceptable, y si pesara se pediría una por lote.
- Esconder el GPS al usuario externo (portal) es una decisión del Hito 9; hoy ese usuario no alcanza este recurso.
- La rotación por EXIF solo la resuelve el navegador (el lienzo); una subida directa por API sin pasar por él puede quedar de lado.
