// gjs -m window.js TITLE W H : one Gtk4 window whose title is the handle the scripts find it by.
import Gtk from 'gi://Gtk?version=4.0';
const [title, w, h] = ARGV;
const app = new Gtk.Application({application_id: `test.win.${title}`});
app.connect('activate', () => {
    const win = new Gtk.ApplicationWindow({application: app, title, default_width: +w, default_height: +h});
    win.set_child(new Gtk.Label({label: title}));
    win.present();
});
app.run([]);
