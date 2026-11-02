# ADR-0026: Flujos de estado como datos, flujos como código

**Estado:** Aceptada · **Fecha:** 2026-10-30

## Contexto
Tareas y tickets (Hito 3), y después cotizaciones y proyectos, tienen un estado que el cliente quiere configurar: nombres, colores, a qué estado se puede pasar. Hace falta un motor común. El requisito dice que un estado nuevo aplica solo a registros futuros.

## Decisión
- **Un flujo es un código en la aplicación** (`WorkflowCode`: `task`, `ticket`), no una fila. Un flujo nuevo llega con el hito que lo necesita, junto con su siembra. No hay pantalla para crear flujos: cada uno existe porque un módulo lo lee.
- **Los estados y las transiciones son datos:** `workflow_states` (nombre, color, orden, bandera inicial, bandera final) y `workflow_transitions` (de A a B). Un solo recurso de permisos, `workflow_states`; editar incluye las transiciones.
- **Banderas mínimas:** inicial (con qué estado nace un registro; exactamente uno activo por flujo, garantizado por un índice único sobre una columna generada) y final (alcanzarlo cierra el registro; al menos uno activo). Otras banderas, como «aceptada» para cotizaciones, se agregan cuando un consumidor las necesite.
- **Desactivar un estado no toca los registros que ya están en él** (ADR-0023): lo conservan, y el estado deja de ser destino. Sus transiciones quedan guardadas y vuelven al reactivarlo. «Un estado nuevo aplica solo a registros futuros» significa que agregar un estado nunca cambia el de un registro existente; esos registros llegan a él únicamente por una transición permitida.
- **Las transiciones se reemplazan como conjunto** (`PUT`), como los permisos de un perfil, y solo entre estados activos. La lista no lleva paginación: un flujo tiene pocos estados.
- **El motor solo responde dos preguntas** (`WorkflowEngine`): con qué estado empieza un registro y si puede pasar de A a B. Guardar el estado, el hilo y las notificaciones son del módulo dueño del registro.
- Cada escritura bloquea las filas del flujo (`FOR UPDATE`), para que las reglas que miran todo el flujo se cumplan con dos administradores a la vez.

## Alternativas descartadas
- **Tabla `workflows` con CRUD:** permisos y pantallas para algo que el código ya tiene que conocer.
- **Estados como un `ENUM` o constantes:** el cliente no podría renombrarlos ni recolorearlos.
- **Transiciones por perfil** (quién puede hacer cada paso): no lo pidió nadie; se agrega con una columna cuando haga falta.
- **Que un estado terminal no pueda tener salidas:** reabrir un ticket resuelto es legítimo, y la bandera solo dice «cierra el registro».

## Consecuencias
- Cada módulo con estado guarda el `state_id` y llama al motor al cambiarlo; el cambio de estado entra al hilo de actividad (3.3).
- Un estado inactivo sigue mostrándose en los registros que lo tienen, con su nombre y color.
- Los estados de cliente (PM2) siguen siendo un catálogo sin transiciones hasta resolver P3; migrarlos aquí sería una migración posterior.
