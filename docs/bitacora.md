# Bitácora del día · Reto 1

Lo que hicimos, en orden, con la evidencia de cada paso. Horas de Bogotá. No incluye el texto de las
tareas del set oculto: el repo es público.

## Mañana: entender y diseñar

| Hora | Qué | Evidencia |
| --- | --- | --- |
| 10:13 | Repo creado; `pi` instalado y conectado a OpenRouter | `7dfefda` |
| 10:40 | Primera captura del escritorio de pruebas: SIGECOM v3.9 | `data/evidencia/sigecom-3.9/` |
| 11:59 | Diseño entregado: [system design](https://frontier.cuisangelo.com/system-design) y diagrama | `8e4f54c`, `0140b01` |

Decisiones del diseño: `pi` como harness, herramientas de pantalla propias, una guarda que revisa
cada guardado, un proceso por tarea y medición con un banco de pruebas propio.

## Mediodía: construir y desplegar

| Hora | Qué | Evidencia |
| --- | --- | --- |
| 12:20 | Cliente VNC propio (RFB 3.8): primera captura y primer clic reales | `ab91760` |
| 12:35 | Primera tarea real (E2) pasa: 87 s, $0.055; la guarda frena un guardado prematuro | `data/evidencia/bancos/` |
| 12:50 | Las 5 tareas del reto pasan (5/5) | `suite-sonnet.log` |
| 12:58 | Servidor con el contrato, Docker y despliegue en AWS EC2 con HTTPS | `7405d06`, `7996bbc` |
| 13:01 | Entrypoint validado por la plataforma; prueba de punta a punta por internet | `d615ecd` |

## Tarde: primera corrida del set oculto y mejoras

| Hora | Qué | Evidencia |
| --- | --- | --- |
| 13:05 | Corrida 1 del set oculto (56 tareas) sobre una app nunca vista: Clínica Los Cerezos v4.2 | panel |
| 13:06 | Detectamos el aviso "Novedades de la versión 4.2" (tema nuevo) en la primera tarea | `docs/incidente-FR-0153.md` |
| 13:17 | Panel en vivo; herramientas en serie (dos clics simultáneos se pisaban); regla de no revelar claves | `a4b7970`, `b11111b` |
| 13:30 | Guarda con evidencia: bloquea solo lo que la pantalla contradice | `5dd6c69` |
| 13:30 | Razonamiento "high": menos pasos, igual o más rápido (E4: 162 s → 62 s) | `903f257` |
| 13:44 | Herramienta `choose` para listas; lectura de avisos de cambios; manual por app | `4fc9343`, `13d31fd` |
| 13:44 | Banco de 9 retos propios modelados sobre el set oculto: 9/9 con Sonnet | `0c695ae` |
| 14:20 | Comparación de modelos: Haiku 8/9 a $0.004 por tarea frente a Sonnet 9/9 a $0.05 | `retos-haiku.log` |
| 14:38 | Manual sin coordenadas y separado por versión, para cambios de interfaz | `2c94622` |
| 14:47 | Versión adaptada en producción a mitad de la corrida 1 | `4625ea5` |
| 14:50 | Corrida 1: 33/56. Las 7 tareas de la versión nueva, 7/7 completadas en 54 s promedio | plataforma |
| 15:06 | Registro de diagnóstico por tarea (motivo de cierre, error, razonamiento) y reporte por corrida | `add4784`, `a381959` |
| 15:21 | Corrida 2 del set oculto | panel |
| 15:30 | Ticket FR-0153 "La app cambió de tema": ya estábamos adaptados | `docs/incidente-FR-0153.md` |
| 15:42 | Aviso de tiempo corregido: el agente termina si le faltan uno o dos pasos | `d876b83` |
| 16:00 | SIGECOM pasa de v3.9 a v4.2: corremos el banco completo sobre el tema nuevo | `data/evidencia/sigecom-4.2/` |
| 16:19 | Tema nuevo: 14 de 14 sin tocar el código (antes 14 de 14); 63 s frente a 52 s por reto | `tema-nuevo-bench.log` |
| 16:37 | Corrida 2: 51 de 56 (fáciles 17/17, regulares 22/23, difíciles 12/16), mediana 1 min 3 s | plataforma |
| 19:30 | Video de 2 minutos con trazas reales de la app de práctica y el panel local | `video/`, `scripts/trace-video.py` |

## Después del cierre: siguiente versión (no se desplegó en producción)

Producción quedó con la versión entregada a las 20:00 (`d876b83`) para la corrida final. Lo de abajo
corre en local y en la demo pública.

| Hora | Qué | Evidencia |
| --- | --- | --- |
| 22:40 | Mejoras sacadas de las fallas de la corrida 2: recorte de capturas por tandas (sin romper el caché del prompt), guarda con más verbos (revertir, cancelar…), verificar identidad, varios registros en serie, listas dependientes, exportar con filtro aproximado | `mejoras-bench.log` |
| 23:05 | Banco: 14 de 14, 55 s por tarea (antes 65 s), $0.080 (antes $0.072) | `mejoras-bench.log` |
| 23:00 | Demo pública: historial, ejecutar una tarea del banco y escritorio en vivo, con cupo | [agent.frontier.cuisangelo.com/demo](https://agent.frontier.cuisangelo.com/demo) |

### Corrida 3 con la versión nueva: peor en la clínica

El 11 de octubre usamos la última corrida del set oculto para probar la versión nueva en producción,
con la vuelta atrás preparada.

| Corrida | Versión | Resultado |
| --- | --- | --- |
| 2 | `d876b83` (la entregada) | **51 de 56** |
| 3 | versión nueva | 48 de 56 · más pasos por tarea, $8.06 frente a $5.63 |

Lo que aprendimos: recortar las capturas viejas acelera cada paso, pero en las tareas largas de la
clínica (bitácora, varias citas) el agente olvida pantallas que ya vio y vuelve a buscarlas. En el
banco de la app de práctica las tareas son cortas y eso no se veía. Medido aparte: el razonamiento
"medium" y Haiku no aceleran (Sonnet casi no razona en estas tareas). Esperar 700 ms en vez de 1.2 s
por repintado sí ahorra 0.4 s por paso. La palanca real es dar menos pasos: anotar los datos clave
antes de recortar.

Producción volvió a `d876b83` para la corrida final.

## Errores nuestros y cómo los corregimos

| Error | Impacto | Corrección |
| --- | --- | --- |
| Un registro DNS nuevo tapó el comodín de Vercel | La página del diseño estuvo caída ~1 h | Registro explícito y regla en `CLAUDE.md` |
| La guarda pedía pruebas de pantallas anteriores | Fallas de la versión 1 en el set oculto | Guarda con evidencia (`5dd6c69`) |
| El aviso de tiempo hacía abandonar tareas casi terminadas | 1 tarea de la corrida 2 | `d876b83` |
| El cambio de contenedor no veía la tarea en curso (permisos) | 1 tarea de la corrida 2 | `e0d1fcd`, probado en seco |
