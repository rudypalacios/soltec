# ADR-0028: Las pruebas corren en la sesión, no en GitHub

**Estado:** Aceptada · **Fecha:** 2026-11-09

## Contexto
El plan gratuito de GitHub limita los minutos de Actions por mes. El CI (pruebas de la API y la web, y el E2E) corría en cada push de cada PR y agotó el límite, lo que dejó sin pruebas ni despliegue a `staging`. La sesión de Claude ya tiene lo necesario para correr lo mismo: PHP y MySQL (ADR de `CLAUDE.md` del 2026-10-09), Node y Chromium.

## Decisión
- **Antes de crear un PR, Claude corre las comprobaciones completas en su servidor** (`CLAUDE.md`, sección 7): API (`composer lint`, `analyse` y `test`), web y `shared` (lint, contrato, tipos y pruebas), y el E2E contra el servidor desechable local. Ya no corren como *checks* al subir a GitHub.
- `tests.yml` y `e2e.yml` quedan **solo manuales** (*Run workflow*): sirven para repetir las comprobaciones en los *runners* de GitHub cuando se quiera, por ejemplo antes de un release. `e2e.yml` pide qué escenarios correr (`all` o `changed`).
- `deploy.yml` **solo despliega, y solo corre al fusionar en `develop` (despliega a `staging`) o en `main` (el release `develop → main`, despliega a producción)** o a mano: un PR no ejecuta nada y la etiqueta `pre-deploy` ya no hace nada. Ya no ejecuta las pruebas antes de desplegar. *Run workflow* sobre otra rama despliega esa rama a `staging`. *(Enmienda del 2026-11-09, mismo día: la primera versión dejaba `staging` solo a mano y el usuario pidió que fusionar en `develop` lo despliegue; son dos despliegues por cambio, no más.)*
- El cuerpo del PR dice en una línea que se corrieron las comprobaciones completas en la sesión, y lo que no se pudo comprobar.

## Alternativas descartadas
- **Pagar minutos o instalar un *runner* propio:** el usuario no puede invertir ahora.
- **Repo público (minutos ilimitados):** es una decisión del usuario y expone el código y los documentos de diseño. Esta decisión no depende de eso, y además evita esperar al CI en cada push.
- **Correr solo el E2E o solo las pruebas en GitHub:** deja la mitad del problema y obliga a mantener dos rutas.

## Consecuencias
- **Los *rulesets* de GitHub exigían los checks `tests / …` y `Playwright` en `develop` y `main` (ADR-0021).** Sin quitarlos, ningún PR se puede fusionar porque esos checks ya no se publican. Los quita el dueño del repo: Settings → Rules → Rulesets, y dejar solo «requerir PR» y el método de fusión.
- Ya no hay una segunda verificación independiente de quien escribe el código: quien revisa el PR confía en lo que el PR dice haber corrido, y puede repetirlo con *Run workflow*. La regresión completa del E2E ya no ocurre sola al fusionar en `develop`: Claude corre toda la suite antes de un PR cuando el cambio toca comportamiento compartido, y a pedido antes de un release.
- Un entorno sin MySQL o sin Chromium (una sesión nueva sin el *setup script*) no puede correr todo: se avisa en el PR lo que no se corrió.
- Reemplaza lo que decían el ADR-0004 («los tests corren antes de desplegar»), el ADR-0020 («cuándo corre») y el ADR-0021 (checks obligatorios) sobre el CI.
