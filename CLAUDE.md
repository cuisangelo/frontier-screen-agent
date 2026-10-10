# frontier-screen-agent

Agente del Reto 1 de Frontier: opera apps sin API por VNC y ejecuta tareas en lenguaje natural.
El diseño vive en `docs/diseno.md`; el contrato y las pruebas del reto, en `material/`.

## El crédito de OpenRouter es oro

La key tiene **$45 en total, sin recarga**, y es lo único que hay para probar el agente de verdad.
Se gasta solo cuando no hay otra forma de obtener la respuesta.

1. **El desarrollo lo razona Claude Code, no OpenRouter.** Para diseñar prompts, interpretar una
   captura, decidir qué haría el agente en una pantalla o depurar una traza, Claude Code mira la
   imagen o el log y razona él mismo. OpenRouter se usa solo para ejecutar el agente real.
2. **Lo que no necesita modelo se prueba sin modelo.** Cliente RFB, `observe`, `click`,
   `type_into`, OCR, servidor, guarda de secretos y armado del resumen se prueban contra el
   escritorio o con fixtures, sin una sola llamada a OpenRouter.
3. **Los tests automáticos nunca llaman a OpenRouter.** Usan un modelo falso o respuestas
   grabadas. Una corrida de tests que gasta crédito es un bug.
4. **Antes de cada corrida que gasta**: consultar el saldo
   (`curl -s https://openrouter.ai/api/v1/key -H "Authorization: Bearer $OPENROUTER_API_KEY"`),
   estimar el costo y, si pasa de **$1**, pedir confirmación al usuario. Empezar siempre con
   **una** tarea, no con el banco completo.
5. **Después de cada corrida que gasta**: anotar en `eval/gasto.md` la fecha y hora, qué se corrió,
   el modelo, el costo real (de las trazas de `pi`) y el saldo restante.
6. **Topes duros en el código**: cada tarea se aborta si su costo pasa de $0.50. Ningún bucle
   reintenta llamadas al modelo sin límite.
7. **Modelos**: Sonnet 5.5 para planificar y Haiku 5.5 para la guarda y la reflexión. Nada de Opus,
   Fable ni modelos `-pro` en OpenRouter sin aprobación explícita del usuario.
8. **Reserva**: cuando el saldo baje de **$15**, se congela todo gasto que no sea la verificación
   final del agente desplegado.

## Reglas del proyecto

- **`pi` es el cerebro del agente.** Es la herramienta central que entrega el evento; no se
  reemplaza por un bucle propio.
- **Nada específico de la app de pruebas en el código ni en los prompts.** La evaluación corre
  sobre otra app. El conocimiento de una app solo vive en su manual (`memoria/<app>/`).
- **Secretos**: `.env` está fuera de git y nunca se imprime. La contraseña del escritorio no entra
  al contexto del modelo ni a ningún log o resumen.
- **Escritorio de pruebas**: `POST /__reset` antes de cada tarea de evaluación; `POST /__check`
  para juzgar. Es el escritorio personal del usuario: no correr dos tareas a la vez sobre él.
- **Stack**: TypeScript con `pnpm`. Despliegue en AWS (`us-east-1`) con el perfil `frontier`, nunca
  con las credenciales root del perfil default.
