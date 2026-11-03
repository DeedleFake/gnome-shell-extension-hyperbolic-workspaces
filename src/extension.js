// Thin entry point: every call site the shell side needs.
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {Plane} from './core/plane.js';
import {ViewState} from './core/view.js';
import {createDiskModel} from './disk/index.js';
import {WorkspaceSource} from './shell/workspaceSource.js';
import {OverviewHook} from './shell/overviewHook.js';
import {Settings} from './shell/settings.js';
import {createWindowMoves} from './shell/windowMoves.js';

export default class HyperbolicWorkspaces extends Extension {
    enable() {
        const settings = new Settings(this.getSettings());
        // Domain state lives enable -> disable; GNOME rebuilds Workspace actors on every Overview open.
        const plane = new Plane({fillOrder: 'distance'});
        const view = new ViewState({plane});
        const disk = createDiskModel(settings.diskModel);   // the one place the open question is answered
        const source = new WorkspaceSource({workspaceManager: global.workspace_manager, display: global.display});
        const hook = new OverviewHook({
            plane, view, disk, settings,
            windowMoves: createWindowMoves({plane, workspaceManager: global.workspace_manager, moveWindow: null /* Main.moveWindowToMonitorAndWorkspace, injected by hook */}),
        });
        source.start(snap => view.absorb(plane.sync(snap, t => view.screenDown(t))));
        hook.start();
        this._parts = [hook, source];   // stop order: hook first
    }

    disable() {
        for (const p of this._parts ?? []) p.stop();
        this._parts = null;
    }
}
