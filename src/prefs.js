// Preferences: the focused tile size slider, with a reset to the default.
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const KEY = 'focused-tile-size';
// Mirrors src/disk/fitted.js SIZE and CLICK_CUTOFF; the schema's range enforces the bounds.
const KLEIN = 2, CUTOFF = 1.8;

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
        const scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, min, max, 0.05);
        Object.assign(scale, {hexpand: true, digits: 2, draw_value: true, value_pos: Gtk.PositionType.LEFT});
        scale.add_mark(1, Gtk.PositionType.BOTTOM, null);
        scale.add_mark(KLEIN, Gtk.PositionType.BOTTOM, 'Klein');
        scale.set_value(settings.get_double(KEY));
        scale.connect('value-changed', () => settings.set_double(KEY, scale.get_value()));
        const reset = new Gtk.Button({icon_name: 'edit-undo-symbolic', valign: Gtk.Align.CENTER, tooltip_text: 'Reset to default'});
        reset.connect('clicked', () => settings.reset(KEY));
        settings.connect(`changed::${KEY}`, () => { if (scale.get_value() !== settings.get_double(KEY)) scale.set_value(settings.get_double(KEY)); });
        row.add_suffix(scale);
        row.add_suffix(reset);
        group.add(row);
        page.add(group);
        window.add(page);
    }
}
