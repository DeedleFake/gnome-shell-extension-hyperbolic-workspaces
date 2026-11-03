#!/usr/bin/python3
"""AT-SPI driver for GTK windows in the container (the prefs window).
a11y.py tree [APP]            dump role|name|value for every node of apps whose name contains APP
a11y.py value ROLE NAME       print the current value of the first matching node
a11y.py set ROLE NAME VALUE   set a Value-interface node (slider)
a11y.py do ROLE NAME          run the node's first action (button click)
ROLE and NAME match case-insensitively by substring; NAME '' matches anything.
Nodes are searched only in apps whose name contains $A11Y_APP (default org.gnome.Shell.Extensions,
the prefs window); the shell's own sliders would otherwise match first."""
import os
import sys
import gi
gi.require_version('Atspi', '2.0')
from gi.repository import Atspi

def walk(node, depth=0):
    yield node, depth
    for i in range(node.get_child_count()):
        c = node.get_child_at_index(i)
        if c is not None:
            yield from walk(c, depth + 1)

def value_of(n):
    v = n.get_value_iface()
    return None if v is None else v.get_current_value()

def apps(filt=''):
    d = Atspi.get_desktop(0)
    for i in range(d.get_child_count()):
        a = d.get_child_at_index(i)
        if a is not None and filt.lower() in (a.get_name() or '').lower():
            yield a

def find(role, name):
    for a in apps(os.environ.get('A11Y_APP', 'org.gnome.Shell.Extensions')):
        for n, _ in walk(a):
            if role.lower() in n.get_role_name().lower() and name.lower() in (n.get_name() or '').lower():
                return n
    sys.exit(f'no node role~{role!r} name~{name!r}')

cmd, *args = sys.argv[1:] or ['tree']
if cmd == 'tree':
    for a in apps(args[0] if args else ''):
        for n, d in walk(a):
            v = value_of(n)
            print('  ' * d + f'{n.get_role_name()}|{n.get_name()}' + ('' if v is None else f'|value={v}'))
elif cmd == 'value':
    print(value_of(find(*args)))
elif cmd == 'set':
    n = find(args[0], args[1])
    ok = n.get_value_iface().set_current_value(float(args[2]))
    print('set', ok, value_of(n))
elif cmd == 'do':
    n = find(*args)
    print('action', n.get_action_iface().do_action(0))
else:
    sys.exit(__doc__)
