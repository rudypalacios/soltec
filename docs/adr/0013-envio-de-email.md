# ADR-0013: Envío de email: SMTP autenticado; buzón del hosting en esta etapa, `mail()` como plan B

**Estado:** Aceptada · reemplaza parcialmente a [ADR-0010](0010-email-smtp-por-instancia.md) (las credenciales ya no viven en la tabla de configuración) · **Fecha:** 2026-10-08

## Contexto
La recuperación de contraseña es crítica: es la salida cuando alguien queda bloqueado. El correo de la organización (`@miempresa.com`) está en un servidor distinto al del cPanel, y quien desarrolla no es su administrador. Un correo enviado con `mail()` desde el hosting con el dominio de la organización sale desde una IP que el SPF de ese dominio no autoriza, y Gmail lo manda a spam o lo rechaza; arreglarlo implicaría editar el DNS del correo de la organización. Criterio de esta etapa: no depender de quien no controlamos ni tocar el correo corporativo.

## Decisión
- **PHPMailer** detrás de una interfaz `MailTransport` (con un transporte falso para los tests).
- Dos controladores, elegidos con `MAIL_DRIVER=smtp|mail` en el `.env` de cada instancia:
  - **`smtp`** (el recomendado): SMTP autenticado con un buzón dedicado.
  - **`mail()`**: entrega al servidor de correo del hosting (Exim), sin credenciales. Plan B.
- **Desarrollo y pruebas (esta etapa):** el remitente es un dominio que controlamos en el hosting (`musicos-catolicos.com`), con un buzón creado en cPanel (por ejemplo `notificaciones@…`) y SMTP autenticado contra el propio servidor del hosting. SPF, DKIM y DMARC del dominio se configuran en cPanel (Email Deliverability). `Reply-To` apunta a una persona.
- **Producción con el dominio de la organización:** SMTP del proveedor donde vive su correo, con un buzón dedicado que cree su administrador (pregunta P24).
- Las credenciales SMTP viven solo en el `.env`, nunca en la base de datos. La configuración general guarda únicamente el remitente (nombre y dirección).
- El remitente debe ser un buzón o alias real del dominio autenticado: los proveedores reescriben el remitente por la cuenta con la que se autentica.
- Encabezados saneados (sin saltos de línea en remitente, asunto ni destinatario).
- Se mantiene de ADR-0010: Web Push con VAPID, sin SMS en la v1.

## Alternativas descartadas
- **`mail()` con el dominio de la organización desde el hosting:** falla SPF mientras el correo esté en otro proveedor.
- **Corregir SPF y DKIM en el DNS del correo de la organización:** toca su correo corporativo y requiere a su administrador.
- **SMTP de Google Workspace desde ya:** depende de que su administrador cree el buzón y permita contraseñas de aplicación, y de que sea realmente Workspace (no confirmado).
- **Brevo / SES:** válidos, con costo o límites; quedan disponibles cambiando `MAIL_DRIVER` y el `.env`.

## Consecuencias
- Para publicar SPF y DKIM desde cPanel, el DNS del dominio debe estar en cPanel; si está en el registrador, esos registros se agregan allí.
- Los correos de producción pueden salir de un dominio distinto al de la organización hasta resolver P24.
- PHPMailer devuelve el error SMTP concreto, así que los fallos de envío son visibles en el log.
- Con `mail()` no hay confirmación de entrega ni rebotes, y depende de la reputación de la IP compartida.
- Se prueba el envío real a Gmail y Outlook durante el scaffolding.
