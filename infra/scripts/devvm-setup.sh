#!/usr/bin/env bash
# Eenmalige inrichting van de ontwikkel-VM (draai dit óp de VM na de eerste SSH-login).
# Installeert: Azure CLI + Bicep, Node.js 22, GitHub CLI, PostgreSQL-client, Docker, Claude Code, en kloont de repo.
set -euo pipefail

echo "== systeem bijwerken =="
sudo apt-get update -q && sudo apt-get upgrade -y -q
sudo apt-get install -y -q curl git jq unzip ca-certificates gnupg postgresql-client

echo "== Azure CLI + Bicep =="
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
az bicep install

echo "== Node.js 22 =="
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y -q nodejs

echo "== GitHub CLI =="
sudo mkdir -p -m 755 /etc/apt/keyrings
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt-get update -q && sudo apt-get install -y -q gh

echo "== Docker (voor de devcontainer, optioneel) =="
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"

echo "== Claude Code =="
sudo npm install -g @anthropic-ai/claude-code

echo "== repo klonen =="
if [ ! -d "$HOME/makelaarscockpit" ]; then
  git clone https://github.com/CherryMedia1/makelaarscockpit.git "$HOME/makelaarscockpit"
fi

echo
echo "Klaar. Uitgaand IP van deze VM: $(curl -s https://api.ipify.org)"
echo "Nog te doen: 'az login --use-device-code', 'gh auth login', 'claude' (eenmalig inloggen), en opnieuw inloggen voor Docker-rechten."
