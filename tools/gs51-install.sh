#!/bin/sh
# Installs this tree into the gs51 container as the only enabled extension and restarts the headless shell.
set -eu
cd "$(dirname "$0")/.."
uuid=$(sed -n 's/.*"uuid": *"\([^"]*\)".*/\1/p' metadata.json)
dir=/root/.local/share/gnome-shell/extensions/$uuid
docker exec gs51 rm -rf "$dir"
docker exec gs51 mkdir -p "$dir"
{ (cd src && git ls-files --cached --others --exclude-standard . | tar -cf - -T -) ; } | docker exec -i gs51 tar -xf - -C "$dir"
tar -cf - metadata.json schemas | docker exec -i gs51 tar -xf - -C "$dir"
docker exec gs51 glib-compile-schemas "$dir/schemas"
docker exec gs51 sh -c "export DBUS_SESSION_BUS_ADDRESS=\$(cat /tmp/bus); gsettings set org.gnome.shell enabled-extensions \"['$uuid']\"; gsettings set org.gnome.shell disable-user-extensions false"
docker exec gs51 /restart-shell.sh
for i in $(seq 60); do
	out=$(docker exec gs51 /shell-eval.sh "Main.extensionManager.lookup('$uuid')?.state" 2>/dev/null || true)
	case $out in *"true, '1'"*) echo "enabled: $uuid"; exit 0;; esac
	sleep 1
done
echo "not enabled: $out" >&2
exit 1
