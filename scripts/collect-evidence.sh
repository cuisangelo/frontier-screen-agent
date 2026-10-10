#!/bin/sh
# Gathers screenshots, bench logs and run reports into data/evidencia for the
# video and the debrief. data/ is git-ignored: hidden-set material never reaches
# the public repo. Usage: scripts/collect-evidence.sh <scratch-dir>
set -eu
T="$1"
E=data/evidencia
mkdir -p "$E/sigecom-3.9" "$E/sigecom-4.2" "$E/bancos" "$E/clinica" "$E/panel"

copy() { [ -f "$1" ] && cp "$1" "$2" || echo "falta: $1"; }

copy "$T/rfb1.png" "$E/sigecom-3.9/01-primera-captura-cliente-vnc.png"
copy "$T/act-search.png" "$E/sigecom-3.9/02-busqueda-con-tilde.png"
copy "$T/tema-nuevo.png" "$E/sigecom-3.9/03-inicio-antes-del-cambio.png"
copy "$T/nav3.png" "$E/sigecom-3.9/04-clientes.png"
copy "$T/x-pedidos.png" "$E/sigecom-3.9/05-pedidos.png"
copy "$T/x-fact.png" "$E/sigecom-3.9/06-facturas.png"
copy "$T/x-integr.png" "$E/sigecom-3.9/07-integraciones-clave.png"
copy "$T/sigecom-ahora.png" "$E/sigecom-4.2/01-inicio-con-aviso-4.2.png"

for log in suite-sonnet suite-guard suite-high retos-1 retos-haiku manual-test tema-nuevo-bench; do
  copy "$T/$log.log" "$E/bancos/$log.log"
done

copy "$T/panel.png" "$E/panel/panel.png"
copy "$T/hidden/t1-001.png" "$E/clinica/01-primera-pantalla-clinica-4.2.png"
for r in data/reporte-corrida-*.md; do copy "$r" "$E/clinica/"; done

find "$E" -type f | sort
