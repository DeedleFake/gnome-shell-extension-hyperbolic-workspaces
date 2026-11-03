// Thin entry point: every call site the shell side needs.
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {Plane} from './core/plane.js';
import {ViewState} from './core/view.js';
import {createDiskModel} from './disk/index.js';
import {WorkspaceSource} from './shell/workspaceSource.js';
import {OverviewHook, moveWindow} from './shell/overviewHook.js';
import {Settings} from './shell/settings.js';
import {createWindowMoves} from './shell/windowMoves.js';

export default class HyperbolicWorkspaces extends Extension {
    enable() {
        const settings = new Settings(this.getSettings());
        // Domain state lives enable -> disable; GNOME rebuilds Workspace actors on every Overview open.
        const plane = new Plane({fillOrder: 'distance'});
        const view = new ViewState({plane});
        const disk = createDiskModel(settings.diskModel);   // the one place the open question is answered
        const workspaceManager = global.workspace_manager;
        const windowMoves = createWindowMoves({
            plane, workspaceManager, moveWindow, monitorIndex: () => global.display.get_primary_monitor(),
        });
        const source = new WorkspaceSource({workspaceManager, display: global.display});
        const hook = new OverviewHook({plane, view, disk, settings, windowMoves});
        source.start(snap => {
            view.absorb(plane.sync(snap, t => view.screenDown(t)));
            hook.refresh();
        });
        hook.start();
        this._stop = () => { hook.stop(); source.stop(); view.destroy(); };
    }

    disable() {
        this._stop?.();
        this._stop = null;
    }
}
