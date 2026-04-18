#!/bin/bash
# Prüfe, welches Tool verfügbar ist
if command -v podman &> /dev/null; then
    DOCKER_BIN="podman"
elif command -v docker &> /dev/null; then
    DOCKER_BIN="docker"
else
    echo "Keine Container-Engine gefunden!"
    exit 1
fi


($DOCKER_BIN network inspect matterbridge || $DOCKER_BIN network create matterbridge) && $DOCKER_BIN pull mcr.microsoft.com/devcontainers/javascript-node:24-trixie