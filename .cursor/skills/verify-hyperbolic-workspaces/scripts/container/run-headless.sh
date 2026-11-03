#!/bin/sh
# Inside the container: headless GNOME Shell 51 on one virtual monitor.
# No systemd in a container, so logind is faked with python-dbusmock and the a11y bus is started by hand.
mkdir -p /run/dbus; [ -S /run/dbus/system_bus_socket ] || dbus-daemon --system --fork
pgrep -f "dbusmock --system" >/dev/null || python3 -m dbusmock --system --template logind > /tmp/logind.log 2>&1 &
sleep 1
export XDG_RUNTIME_DIR=/tmp/xdg; mkdir -p $XDG_RUNTIME_DIR; chmod 700 $XDG_RUNTIME_DIR
export LIBGL_ALWAYS_SOFTWARE=1 GTK_A11Y=atspi NO_AT_BRIDGE=0
exec dbus-run-session -- sh -c '
  echo "$DBUS_SESSION_BUS_ADDRESS" > /tmp/bus
  gsettings set org.gnome.mutter dynamic-workspaces true
  gsettings set org.gnome.desktop.interface toolkit-accessibility true
  /usr/libexec/at-spi-bus-launcher --launch-immediately > /tmp/atspi.log 2>&1 &
  exec gnome-shell --headless --unsafe-mode --virtual-monitor 1280x800 > /tmp/shell.log 2>&1'
