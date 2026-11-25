# ADR-0031: Notificaciones con reglas en código

**Estado:** Aceptada · **Fecha:** 2026-11-25

## Contexto
El plan decía «notificaciones configurables por perfil y departamento» (CLAUDE.md §4, Hito 3, módulo 15 del mapa). El dueño del producto lo revierte antes de construirlas: una matriz de tipo × perfil × departamento × canal se vuelve ingobernable cuando la plataforma crece, y lo que la gente espera es simple: todo lo que pasa en un registro mío me avisa, salvo lo que hice yo.

## Decisión
- **Las reglas viven en el código.** Cada tipo de aviso es un caso de `NotificationType`; el módulo dueño del registro decide a quién avisa. No hay tabla de reglas, ni pantalla, ni permiso para configurarlas. Un módulo nuevo agrega su tipo y sus destinatarios en su propio código.
- **Tareas (y, en 3.5, tickets):** el dueño y el asignado reciben aviso de todo lo que pasa en el registro (asignación, comentarios y fotos, cambios de estado, de asignado y de vencimiento, vencimientos). Quien fue mencionado recibe solo el aviso de la mención: la mención no lo hace seguidor. Si alguien es participante y a la vez mencionado, recibe solo la mención.
- **Nadie recibe aviso de lo que hizo él mismo.** El actor se quita de los destinatarios al publicar. Los recordatorios no tienen actor.
- **Clientes:** el asesor que se agrega a un cliente, o se le quita, recibe aviso (también en la entrega de una cartera, un aviso por cliente).
- **Dos canales fijos, sin elegir:** la aplicación (una fila por persona y evento en `notifications`) y el correo (un correo por aviso, sin agrupar; si el hosting limita el envío, se atiende entonces). El correo nunca lleva el texto de un comentario, solo quién, qué, dónde y un enlace.
- **Se publica dentro de la transacción del cambio** (`NotificationService::publish`), para que un aviso nunca cuente algo que no pasó. El correo sale después de la respuesta (`DeferredTasks`) y nunca rompe el cambio: un fallo queda en `email_status` (`failed`) con su motivo y en el log. No hay cola con reintentos automáticos; reenviar los fallidos queda como un comando más si hace falta.
- **Lo que ningún usuario causa** (tarea que vence mañana, tarea vencida) lo crea el comando `php api/bin/console notifications:run`, que el cron del hosting ejecuta cada hora. Cada recordatorio lleva una clave única (tipo, registro y fecha de vencimiento), así que repetir la corrida no repite el aviso, y cambiar la fecha permite uno nuevo. Solo se avisa de tareas abiertas y activas; «venció» solo de las que vencieron en los últimos 7 días, para que la primera corrida de una instancia con tareas viejas no inunde a nadie.
- **La única configuración** es la hora local (zona de la empresa) desde la que salen esos recordatorios (`notification_settings.due_reminder_hour`, 8 por defecto), con su permiso `notification_settings`. El requisito del servidor avisa si el comando no corre hace más de 2 horas.
- **Actualizaciones por polling** (ADR-0005): `GET /v1/updates?since=` devuelve las no leídas y las nuevas desde la última consulta. Los avisos se leen con cursor por id (los UUID v7 ordenan por creación). Abrir un aviso lo marca leído.
- **Un aviso cuyo comentario se desactiva se retira** (`deleted_at`; nada se borra), igual que si una edición quita la mención.

## Alternativas descartadas
- **Matriz de reglas por perfil y departamento** (el plan original): configuración que nadie pidió y que crece con cada módulo.
- **Correo agrupado por tarea con cola:** ahorra correos, pero añade una cola y un modelo de lotes antes de saber si el hosting estorba. Queda disponible si el límite aparece.
- **Seguir una tarea al mencionarse:** es una función aparte (suscripciones) que nadie pidió.
- **Recordatorios perezosos (la primera petición de la hora los crea):** no necesitan cron, pero un fin de semana sin tráfico no avisa nada.

## Consecuencias
- Cambia lo que decían CLAUDE.md (§3 y §4) y el módulo 15 del mapa de módulos; se ajustan en el mismo cambio.
- El correo corre por el límite del hosting sin colchón: una cartera de 30 clientes entregada de golpe manda 30 correos seguidos. Los fallos se ven en `email_error`.
- **Sin el cron, todo funciona salvo los recordatorios de vencimiento**, y `/system/requirements` lo advierte.
- Un estado `sending` que quede colgado si el proceso muere a mitad de un envío no se reintenta solo; hay que reenviarlo a mano.
- Cuando un registro cambia de asignado, quien lo tenía deja de alcanzarlo y, si fue quien lo cambió, su petición responde 404 aunque el cambio se guardó (comportamiento previo de 3.3, ahora más visible).
