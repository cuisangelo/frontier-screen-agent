# Incidente FR-0153 · La app cambió de tema

**Ticket**: "La app cambió de tema y la automatización ya no encuentra los controles". Prioridad
alta, abierto a las 15:30.

**Qué cambió, según el ticket**: botones movidos de lugar, etiquetas distintas y un modal nuevo al
abrir la app. El set de evaluación oculto corre sobre el tema nuevo.

## Línea de tiempo

| Hora (Bogotá) | Qué pasó |
| --- | --- |
| 13:06 | Primera tarea del set oculto: vemos el aviso "Novedades de la versión 4.2" |
| 13:30 | Guarda con evidencia y memoria de guardados aprobados (`5dd6c69`) |
| 13:44 | El prompt lee los avisos de cambios y busca la barra de acciones (`4fc9343`) |
| 14:38 | Manual sin coordenadas y separado por versión (`2c94622`) |
| 14:47 | Versión adaptada en producción |
| 15:30 | Se abre el ticket FR-0153 |

El agente ya estaba adaptado y en producción casi una hora antes del ticket.

## Detección

Lo vimos en nuestras propias trazas antes de que llegara el ticket. En la primera corrida del set
oculto, cada tarea empezaba con un aviso nuevo: "Novedades de la versión 4.2". Ese aviso anunciaba
los mismos tres cambios del ticket:

| Ticket | Aviso que mostraba la app |
| --- | --- |
| Botones movidos de lugar | "La barra de acciones pasó a la derecha" |
| Etiquetas distintas | "Nuevos nombres en los botones" (por ejemplo, "Aplicar" en vez de "Guardar") |
| Modal nuevo al abrir | El propio aviso, con el botón "Entendido" |

Además decía: "los formularios ahora se aplican sin cerrarse". Eso abre un riesgo nuevo: guardar
dos veces el mismo formulario.

Las trazas (captura y acción por paso) y el panel en vivo nos dejaron ver el cambio sin depender del
número total que da la plataforma.

## Por qué el agente no se rompió

El diseño nunca dependió de la forma de la app:

- No hay coordenadas ni selectores fijos. Cada clic se decide mirando la captura del momento.
- Nada depende del nombre exacto de un botón. El modelo declara cuándo un clic guarda, y la guarda
  reconoce varios verbos.

## Adaptación

| Cambio | Qué hicimos | Commit |
| --- | --- | --- |
| Modal nuevo al abrir | El prompt pide leer los avisos de cambios antes de cerrarlos, porque pueden anunciar botones nuevos | `4fc9343` |
| Etiquetas distintas | La guarda reconoce "aplicar", "emitir", "anular" y "confirmar", no solo "guardar" | `5dd6c69` |
| Botones movidos | El prompt pide buscar la barra de acciones (derecha o abajo) antes de hacer clic | `4fc9343` |
| Formularios que no se cierran | La guarda recuerda los guardados ya aprobados en la tarea y frena uno repetido | `5dd6c69` |
| Manual aprendido que queda viejo | El manual guarda solo nombres y rutas, nunca coordenadas, anota la versión de la app y se separa por versión | `2c94622` |
| Listas desplegables nuevas | Herramienta `choose` para elegir opciones sin depender de un Enter sobre una lista abierta | `4fc9343` |

## Resultado

| Versión del agente | Tareas sobre el tema nuevo | Completadas por el agente | Tiempo promedio |
| --- | --- | --- | --- |
| v1 (antes de adaptar) | 48 | 56 % | 117 s |
| v3 (adaptada), corrida 1 | 7 | 7 de 7 | 54 s |
| v3, corrida 2 (primeras tareas) | 7 | 6 de 7 | — |

Corrida 1 del set oculto: 33 de 56, la mayoría con la v1. Las tareas que fallaban con la v1
(cancelaciones con reverso, citas con autorización, notas por inasistencia) terminan con la v3.

### Antes y después en la misma app

A las 16:00 el escritorio de pruebas (SIGECOM) también pasó al tema 4.2. Corrimos encima el mismo
banco que usábamos con el tema anterior, con el mismo agente y sin tocar el código: Sonnet 5.5 con
razonamiento "high".

| Banco | Tema 3.9 | Tema 4.2 |
| --- | --- | --- |
| 9 retos propios (R01–R09) | 9 de 9 · 52 s · $0.050 por tarea | 9 de 9 · 63 s · $0.071 por tarea |
| 5 tareas de ejemplo del reto (E1–E5) | 5 de 5 | 5 de 5 · 70 s · $0.073 por tarea |

En las 14 tareas el agente cerró el aviso con "Entendido", buscó con "Filtrar" y guardó con
"Aplicar" a la derecha. Las que debían fallar fallaron con la razón correcta: homónimos, clave
secreta, borrado masivo y pedido inexistente. Cada tarea tarda unos 11 s más que con el tema
anterior: el aviso nuevo y los diálogos de confirmación suman pasos.

Capturas en `data/evidencia/sigecom-3.9/08` (Guardar a la izquierda) y `sigecom-4.2/04` (Aplicar
a la derecha); log en `data/evidencia/bancos/tema-nuevo-bench.log`.

## Lo que queda

- La falla que queda en la corrida 2 no viene del tema: el agente se quedó sin tiempo a un clic de
  guardar. Lo corregimos con un aviso de tiempo que prioriza terminar.
