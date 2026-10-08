# ADR-0007: PDFs con Dompdf

**Estado:** Aceptada · **Fecha:** 2026-10-08

## Contexto
Se generan PDFs de cotizaciones y órdenes de compra. El hosting solo ofrece PHP: no hay Chrome headless ni wkhtmltopdf.

## Decisión
**Dompdf**: PHP puro, convierte HTML/CSS a PDF. Las plantillas HTML de los documentos son la única excepción a "PHP no renderiza vistas". El PDF se genera bajo demanda y no se almacena (solo los datos).

## Alternativas descartadas
- **mPDF:** mejor con tablas largas y encabezados repetidos; queda como respaldo si Dompdf se queda corto.
- **TCPDF/FPDF:** layout a mano, más trabajo.
- **Chrome headless / wkhtmltopdf:** no corren en hosting compartido.

## Consecuencias
- Dompdf soporta CSS 2.1 (sin flexbox ni grid): las plantillas se arman con tablas.
- Consume memoria en documentos grandes: se vigila `memory_limit`.
