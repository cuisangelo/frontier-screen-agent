#!/bin/bash
# EC2 bootstrap: Docker with the compose plugin. Holds no secrets; .env is copied over SSH.
set -euo pipefail
dnf install -y docker rsync
systemctl enable --now docker
usermod -aG docker ec2-user
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-aarch64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
mkdir -p /opt/agent && chown ec2-user:ec2-user /opt/agent
