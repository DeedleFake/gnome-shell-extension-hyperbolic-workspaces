// Preferences: the focused tile size slider with a reset, the page-key switch and the move modifier.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const KEY = 'focused-tile-size';
// Mirrors disk/fitted.js SIZE and CLICK_CUTOFF; the schema's range enforces the bounds.
const KLEIN = 2, CUTOFF = 1.8;
const STEPS_PER_UNIT = 20;
// Schema enum nicks in order, with their labels.
const MODIFIERS = [['super', 'Super'], ['shift', 'Shift'], ['control', 'Ctrl'], ['alt', 'Alt']];

export default class HyperbolicWorkspacesPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const [min, max] = settings.get_range(KEY).deepUnpack()[1].deepUnpack();
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Disk drawing',
            description: `1 is the plain drawing; ${KLEIN} is the Klein model. From ${CUTOFF} up only the focused workspace's windows can be clicked.`,
        });
        const row = new Adw.ActionRow({title: 'Focused tile size'});
        const scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, min, max, 1 / STEPS_PER_UNIT);
        Object.assign(scale, {hexpand: true, digits: 2, draw_value: true, value_pos: Gtk.PositionType.LEFT});
        scale.add_mark(1, Gtk.PositionType.BOTTOM, null);
        scale.add_mark(KLEIN, Gtk.PositionType.BOTTOM, 'Klein');
        scale.set_value(settings.get_double(KEY));
        // AT-SPI writes bypass the step, so snap here: 2.2 would otherwise store as 2.2000000000000002.
        scale.connect('value-changed', () => settings.set_double(KEY, Math.round(scale.get_value() * STEPS_PER_UNIT) / STEPS_PER_UNIT));
        const reset = new Gtk.Button({icon_name: 'edit-undo-symbolic', valign: Gtk.Align.CENTER, tooltip_text: 'Reset to default'});
        reset.connect('clicked', () => settings.reset(KEY));
        settings.connect(`changed::${KEY}`, () => { if (scale.get_value() !== settings.get_double(KEY)) scale.set_value(settings.get_double(KEY)); });
        scale.update_property([Gtk.AccessibleProperty.LABEL], [row.title]);
        row.activatable_widget = scale;
        row.add_suffix(scale);
        row.add_suffix(reset);
        group.add(row);
        page.add(group);
        page.add(keysGroup(settings));
        window.add(page);
        // GTK picks its own first focus when the window activates, so take it back once then.
        const id = window.connect('notify::is-active', () => {
            if (!window.is_active) return;
            window.disconnect(id);
            scale.grab_focus();
        });
    }
}

function keysGroup(settings) {
    const group = new Adw.PreferencesGroup({title: 'Keys and dragging'});
    const pageKeys = new Adw.SwitchRow({
        title: 'Page keys switch workspaces',
        subtitle: 'PgUp, PgDn, Home and End switch to the workspace, not just move the focus',
    });
    settings.bind('page-keys-activate', pageKeys, 'active', Gio.SettingsBindFlags.DEFAULT);
    const modifier = new Adw.ComboRow({
        title: 'Move modifier',
        subtitle: 'Hold it while dragging to move a whole workspace',
        model: Gtk.StringList.new(MODIFIERS.map(m => m[1])),
    });
    const sync = () => {
        const i = MODIFIERS.findIndex(m => m[0] === settings.get_string('move-modifier'));
        if (modifier.selected !== i) modifier.selected = i;
    };
    sync();
    settings.connect('changed::move-modifier', sync);
    modifier.connect('notify::selected', () => settings.set_string('move-modifier', MODIFIERS[modifier.selected][0]));
    group.add(pageKeys);
    group.add(modifier);
    return group;
}
