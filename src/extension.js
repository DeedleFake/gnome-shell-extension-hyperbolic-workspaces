// Thin entry point: every call site the shell side needs.
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {Plane} from './core/plane.js';
import {ViewState} from './core/view.js';
import {createDiskModel} from './disk/index.js';
import {WorkspaceSource} from './shell/workspaceSource.js';
import {OverviewHook, moveWindow, watchSessionMode} from './shell/overviewHook.js';
import * as layoutStore from './shell/layoutStore.js';
import {Settings} from './shell/settings.js';
import {createWindowMoves} from './shell/windowMoves.js';

export default class HyperbolicWorkspaces extends Extension {
    enable() {
        const settings = new Settings(this.getSettings());
        // Domain state lives enable -> disable; GNOME rebuilds Workspace actors on every Overview open.
        const plane = layoutStore.take(() => new Plane({fillOrder: 'distance'}));
        const view = new ViewState({plane});
        const disk = createDiskModel('straight');
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
        // The lock screen keeps the extension enabled (metadata session-modes) but gets no Overview patches or key capture.
        const unwatch = watchSessionMode(mode => mode === 'user' ? hook.start() : hook.stop());
        this._stop = () => { unwatch(); hook.stop(); source.stop(); view.destroy(); layoutStore.keep(plane); };
    }

    disable() {
        this._stop?.();
        this._stop = null;
    }
}
