#!/bin/sh
# Waits until the task now running finishes, then swaps the agent container at once.
SSH="ssh -i /Users/cuis/.ssh/frontier-agent.pem -o ConnectTimeout=10 ec2-user@100.49.238.204"
running() {
  $SSH 'cd /opt/agent && docker compose exec -T agent node -e "
const fs=require(\"fs\");const d=\"/data/tasks\";
const r=fs.readdirSync(d).map(f=>[f,JSON.parse(fs.readFileSync(d+\"/\"+f))]).filter(([,t])=>t.estado===\"en_curso\");
console.log(r.map(([f])=>f).join(\",\"));"' 2>/dev/null
}
first=$(running)
echo "en curso al empezar: ${first:-ninguna}"
i=0
while [ -n "$first" ] && [ $i -lt 200 ]; do
  now=$(running)
  case ",$now," in *",$first,"*) ;; *) break ;; esac
  sleep 2
  i=$((i + 1))
done
echo "cambio de contenedor a las $(date +%H:%M:%S)"
$SSH 'cd /opt/agent && docker compose up -d --no-deps agent panel 2>&1 | tail -2'
sleep 3
curl -s -o /dev/null -w 'health tras el cambio: %{http_code}\n' https://agent.frontier.cuisangelo.com/health
