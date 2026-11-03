#!/bin/sh
# Builds the hyperbolic-gs51:verify image once (Fedora 45 = GNOME Shell 51.1). Idempotent: exits if it exists.
set -eu
export DOCKER_HOST=${DOCKER_HOST:-tcp://127.0.0.1:2375}
IMAGE=${HW_IMAGE:-hyperbolic-gs51:verify}
docker image inspect "$IMAGE" >/dev/null 2>&1 && { echo "image ready: $IMAGE"; exit 0; }
b=hw-imagebuild-$$
docker run -d --name "$b" fedora:45 sleep infinity >/dev/null
trap 'docker rm -f "$b" >/dev/null' EXIT
# The TCP daemon drops long exec streams, so dnf runs detached and its log is polled.
docker exec -d "$b" sh -c 'dnf -y --setopt=install_weak_deps=False --disablerepo=fedora-cisco-openh264 install \
  gnome-shell gjs mutter dbus-daemon mesa-dri-drivers procps-ng python3-dbusmock python3-gobject \
  at-spi2-core at-spi2-atk libadwaita glib2 > /tmp/dnf.log 2>&1; echo "exit $?" >> /tmp/dnf.log'
until docker exec "$b" grep -q '^exit ' /tmp/dnf.log 2>/dev/null; do sleep 10; done
docker exec "$b" grep -q '^exit 0' /tmp/dnf.log || { docker exec "$b" tail -20 /tmp/dnf.log; exit 1; }
docker commit "$b" "$IMAGE" >/dev/null
echo "image built: $IMAGE"
