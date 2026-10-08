# ADR-0009: Archivos locales e imágenes en WebP

**Estado:** Aceptada · **Fecha:** 2026-10-08

## Contexto
Los técnicos subirán fotos de campo. El cliente quiere conservar la información del EXIF (ubicación, fecha, equipo). El espacio en el hosting es limitado, pero hoy alcanza. El servidor soporta crear WebP con GD. Comprimir en el navegador con canvas y re-codificar con GD descartan el EXIF del archivo.

## Decisión
- Almacenamiento local **fuera del directorio público**, servido por un endpoint con control de permisos, detrás de una interfaz `FileStorage`.
- En el celular: se leen los metadatos EXIF **antes** de comprimir (p. ej. con `exifr`) y se envían aparte; la imagen se reduce a ~1600 px en JPEG (Safari no codifica WebP de forma fiable).
- En el servidor (GD): se generan dos WebP, **normal** (~1600 px) y **miniatura** (~320 px).
- Los metadatos (GPS, fecha, dispositivo, lo que venga) se guardan en una columna JSON `metadatos`. Si la foto no trae GPS, se registra la ubicación del dispositivo al capturar (P6).
- El portal externo muestra las imágenes sin GPS embebido; la ubicación queda solo en la base de datos.

## Alternativas descartadas
- Conservar el EXIF dentro del archivo: GD lo pierde y Imagick no está garantizado.
- Solo JPEG: pesa más.

## Consecuencias
- La calidad/peso del WebP se valida con fotos reales de campo; el formato puede cambiar si no se ve bien.
- Si luego se necesita filtrar por ubicación o fecha, se agrega una columna generada sobre el JSON.
- Migrar a S3 u otro almacenamiento solo cambia la implementación de `FileStorage`.
