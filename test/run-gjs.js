// gjs -m test/run-gjs.js: runs every test/*.test.js under GJS through test/harness.js.
import Gio from 'gi://Gio';
import System from 'system';
import {run} from './harness.js';

const dir = Gio.File.new_for_uri(import.meta.url).get_parent();
const names = [];
const en = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
for (let info; (info = en.next_file(null));) if (info.get_name().endsWith('.test.js')) names.push(info.get_name());
for (const n of names.sort()) await import(`./${n}`);
System.exit(await run() ? 1 : 0);
