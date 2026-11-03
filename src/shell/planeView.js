// The plane actor on the primary monitor. Built per Overview open (like GNOME's views), destroyed on hide.
// Holds no domain state: frames come from ViewState, seats from Plane, the model from DiskModel.
//
// GNOME contract (what WorkspacesDisplay and ControlsManager call on the primary view; workspacesView.js:972-1112):
//   getActiveWorkspace(), prepareToLeaveOverview(), syncStacking(stackIndices),
//   startTouchGesture(), endTouchGesture(), visible, opacity (bound by the display).
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Graphene from 'gi://Graphene';
import St from 'gi://St';
import {GestureMachine} from '../core/gesture.js';
import {CLICK_CUTOFF} from '../disk/index.js';

const NAV = {
    [Clutter.KEY_Left]: 'left', [Clutter.KEY_Right]: 'right', [Clutter.KEY_Up]: 'up', [Clutter.KEY_Down]: 'down',
    [Clutter.KEY_Page_Up]: 'pageUp', [Clutter.KEY_Page_Down]: 'pageDown', [Clutter.KEY_Home]: 'home',
    [Clutter.KEY_End]: 'end',
};
/** Keys that switch the workspace too when page-keys-activate is on. */
const ACTIVATES = new Set(['pageUp', 'pageDown', 'home', 'end']);
const RIM_HIT = 0.15;

/**
 * H3 -> Graphene.Matrix, row-vector order: [h00,h10,0,h20, h01,h11,0,h21, 0,0,1,0, h02,h12,0,h22]
 * (perspective in elements 3 and 7). Only this file knows the layout.
 * @param {import('../core/types.js').H3} h
 */
export function toMatrix(h) {
    return new Graphene.Matrix().init_from_float([
        h[0], h[3], 0, h[6],
        h[1], h[4], 0, h[7],
        0, 0, 1, 0,
        h[2], h[5], 0, h[8]]);
}

/** Any ancestor of `actor` below `stop` that is a GNOME WindowPreview (it carries metaWindow). */
function previewOf(actor, stop) {
    for (let a = actor; a && a !== stop; a = a.get_parent()) if (a.metaWindow) return a;
    return null;
}

export const PlaneView = GObject.registerClass(
class PlaneView extends St.Widget {
    /**
     * @param {{plane, view, disk, windowMoves, settings, monitorIndex: number, overviewAdjustment: object,
     *          WorkspaceClass: Function, workArea: () => {width: number, height: number}, hideOverview: () => void,
     *          dragResult: {CONTINUE: number, MOVE_DROP: number}}} config
     */
    _init(config) {
        super._init({reactive: true, can_focus: true, x_expand: true, y_expand: true, clip_to_allocation: true});
        this._cfg = config;
        this._gesture = new GestureMachine();
        /** @type {Map<object, object>} Meta.Workspace -> GNOME Workspace actor */
        this._actors = new Map();
        this._reach = new Set();
        this._windowReach = new Set();
        this._frame = null;
        this._disk = {cx: 0, cy: 0, r: 1};
        this._carry = null;
        this._grab = null;
        this._delegate = this;   // DND: empty tiles take window drops

        this._backdrop = new St.DrawingArea({x_expand: true, y_expand: true});
        this._backdrop.connect('repaint', a => this._paint(a));
        this.add_child(this._backdrop);

        this._later = 0;
        // The workspace the plane last made active. Anything else changing it (a window or search result
        // activated from the Overview) wins over the plane's focus when the Overview closes.
        this._activated = global.workspace_manager.get_active_workspace();
        config.overviewAdjustment.connectObject('notify::value', () => this._syncState(), this);
        this.connect('notify::mapped', () => { if (this.mapped) { this.grab_key_focus(); this.kick(); } });
        this.connect('destroy', () => this._onDestroy());
        this.kick();
    }

    /** Something changed (a sync, an intent, a key): reallocate, which runs the clock until ViewState idles. */
    kick() {
        // Entering a tile hides the Overview, and without animations GNOME destroys this view before the
        // pointer handler's own kick() runs. New Workspaces built then would leak and trip GC criticals.
        if (this._destroyed) return;
        this._syncActors();
        this.queue_relayout();
    }

    /** One GNOME Workspace per seated key. Outside allocation: a new child must not be added mid-allocate. */
    _syncActors() {
        const {plane} = this._cfg;
        const seated = new Set(plane.seated());
        for (const [k, ws] of this._actors) if (!seated.has(k)) { ws.destroy(); this._actors.delete(k); }
        for (const k of seated) {
            if (this._actors.has(k)) continue;
            const ws = new this._cfg.WorkspaceClass(k, this._cfg.monitorIndex, this._cfg.overviewAdjustment);
            ws._container.reactive = false;   // its ClickGesture would activate on empty space; the plane owns clicks
            ws.opacity = 0;
            this.add_child(ws);
            this._actors.set(k, ws);
            this._syncState(ws);
        }
        // Draw order: the carried workspace, else the focused one, on top.
        const f = this._cfg.view.focus;
        const top = this._actors.get(this._carry?.key ?? (f.kind === 'ws' ? f.key : null));
        if (top && this.get_last_child() !== top) this.set_child_above_sibling(top, null);
    }

    vfunc_get_preferred_width() { return [0, 0]; }
    vfunc_get_preferred_height() { return [0, 0]; }

    vfunc_allocate(box) {
        this.set_allocation(box);
        const [w, h] = box.get_size();
        const d = this._disk = {cx: w / 2, cy: h / 2, r: Math.min(w, h) / 2 * 0.98, size: this._cfg.settings.focusedTileSize};
        this._backdrop.allocate(new Clutter.ActorBox({x1: 0, y1: 0, x2: w, y2: h}));
        const now = GLib.get_monotonic_time() / 1000;
        const {view, plane, disk} = this._cfg;
        const fs = this._frame = view.frameOf(now);
        // The frame clock: while ViewState moves, relayout before every redraw. A Clutter.Timeline would
        // need this actor's stage views, which Clutter refuses (with a warning) while it awaits allocation.
        if (view.step(now) && !this._later) {
            this._later = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._later = 0;
                this.queue_relayout();
                return GLib.SOURCE_REMOVE;
            });
        }
        this._reach = view.reach();
        // From the cutoff size up the neighbors are too small to read: only the focused workspace's windows take clicks.
        this._windowReach = d.size >= CLICK_CUTOFF ? new Set([this._focusTile()]) : this._reach;
        const wa = this._cfg.workArea();
        const wbox = {w: wa.width, h: wa.height};
        const seen = new Set();
        for (const [k, F] of fs.content) {
            const H = disk.place(F, wbox, d);
            if (!H) continue;
            const ws = this._actors.get(k);
            if (!ws) continue;
            seen.add(k);
            ws.opacity = 255;
            ws.allocate(new Clutter.ActorBox({x1: 0, y1: 0, x2: wa.width, y2: wa.height}));
            ws.set_pivot_point(0, 0);
            ws.set_transform(toMatrix(H));
            const live = this._carry?.key !== k && this._windowReach.has(plane.seatOf(k)?.tile);
            this._setReactive(ws, live);
        }
        // Culled by opacity and reactivity: toggling visible or restacking mid-allocate makes Clutter warn about stage views.
        for (const [k, ws] of this._actors) if (!seen.has(k)) { ws.opacity = 0; this._setReactive(ws, false); }
        this._backdrop.queue_repaint();
    }

    // Every pass, not only on change: GNOME adds previews to a Workspace after it was turned off.
    _setReactive(ws, on) {
        ws.reactive = on;
        for (const p of ws._windows) if (p.reactive !== on) p.reactive = on;
    }

    _syncState(only) {
        const v = Math.min(1, this._cfg.overviewAdjustment.value);
        for (const ws of only ? [only] : this._actors.values()) ws.stateAdjustment.value = v;
    }

    _paint(area) {
        const cr = area.get_context();
        const d = this._disk, fs = this._frame;
        cr.arc(d.cx, d.cy, d.r, 0, 2 * Math.PI);
        cr.setSourceRGBA(0.04, 0.07, 0.09, 0.85);
        cr.fill();
        if (fs) {
            const focusTile = this._focusTile();
            for (const [id, F] of fs.tiles) {
                const q = this._cfg.disk.outline(F, d);
                cr.moveTo(...q[0]);
                for (const p of q.slice(1)) cr.lineTo(...p);
                cr.closePath();
                const a = id === focusTile ? 0.9 : this._windowReach.has(id) ? 0.45 : 0.22;
                cr.setSourceRGBA(0.45, 0.6, 0.78, a);
                cr.setLineWidth(id === focusTile ? 2.5 : 1);
                cr.stroke();
            }
            if (fs.rim) {
                const {angle, opacity} = fs.rim;
                const ux = Math.cos(angle), uy = -Math.sin(angle), px = -uy, py = ux;
                const tip = d.r * 1.0, base = d.r * 0.93, wdt = d.r * 0.05;
                cr.moveTo(d.cx + ux * tip, d.cy + uy * tip);
                cr.lineTo(d.cx + ux * base + px * wdt, d.cy + uy * base + py * wdt);
                cr.lineTo(d.cx + ux * base - px * wdt, d.cy + uy * base - py * wdt);
                cr.closePath();
                cr.setSourceRGBA(0.85, 0.9, 1, opacity);
                cr.fill();
            }
        }
        cr.$dispose();
    }

    _focusTile() {
        const f = this._cfg.view.focus;
        return f.kind === 'ws' ? this._cfg.plane.seatOf(f.key)?.tile : f.tile;
    }

    /** Arrows/PgUp/PgDn/Home/End -> view.nav; everything else propagates (type-to-search, Enter, Escape stay GNOME's). */
    vfunc_key_press_event(event) { return this.handleKey(event); }

    /** Also called by OverviewHook from WorkspacesDisplay's captured-event: GNOME gives the display key focus. */
    handleKey(event) {
        if (event.type() !== Clutter.EventType.KEY_PRESS) return Clutter.EVENT_PROPAGATE;
        const nav = NAV[event.get_key_symbol()];
        if (!nav || event.get_state() & Clutter.ModifierType.MODIFIER_MASK & ~Clutter.ModifierType.LOCK_MASK & ~Clutter.ModifierType.MOD2_MASK)
            return Clutter.EVENT_PROPAGATE;
        this._cfg.view.nav(nav);
        const f = this._cfg.view.focus;
        if (ACTIVATES.has(nav) && this._cfg.settings.pageKeysActivate && f.kind === 'ws')
            this._activate(f.key);
        this.kick();
        return Clutter.EVENT_STOP;
    }

    /** Stage point -> local px -> disk point, tile, key; and whether it hits the rim arrow. */
    _locate(event) {
        const [sx, sy] = event.get_coords();
        const [, x, y] = this.transform_stage_point(sx, sy);
        const d = this._disk;
        const p = this._cfg.disk.toDisk(x, y, d);
        const tile = p && this._tileAt(x, y);
        const key = tile === null || tile === undefined ? null : this._cfg.plane.at(tile) ?? null;
        const rim = this._frame?.rim;
        const r = Math.hypot(x - d.cx, y - d.cy) / d.r;
        const ang = Math.atan2(-(y - d.cy), x - d.cx);
        const dA = rim ? Math.abs(Math.atan2(Math.sin(ang - rim.angle), Math.cos(ang - rim.angle))) : Infinity;
        const onRim = !!rim && rim.opacity > 0.5 && r > 0.9 && r < 1.2 && dA < RIM_HIT;
        return {p, xy: [sx, sy], tile: tile ?? null, key, onRim};
    }

    /** Captured pointer events -> disk.toDisk -> gesture.handle -> one ViewState/Plane/windowMoves call per Intent.
     * A plain press on a window preview stays GNOME's (click activates, drag moves the window). */
    vfunc_captured_event(event) {
        const type = event.type();
        const kind = type === Clutter.EventType.BUTTON_PRESS ? 'press'
            : type === Clutter.EventType.MOTION ? 'motion'
            : type === Clutter.EventType.BUTTON_RELEASE ? 'release' : null;
        if (!kind) return Clutter.EVENT_PROPAGATE;
        if (kind === 'press' && event.get_button() !== Clutter.BUTTON_PRIMARY) return Clutter.EVENT_PROPAGATE;
        const moveMod = (event.get_state() & this._cfg.settings.moveModifier) !== 0;
        if (kind === 'press' && previewOf(global.stage.get_event_actor(event), this) && !moveMod) return Clutter.EVENT_PROPAGATE;
        if (kind !== 'press' && !this._grab) return Clutter.EVENT_PROPAGATE;
        const at = this._locate(event);
        if (kind === 'press') {
            this._grab = global.stage.grab(this);
            this._carry = at.key !== null && moveMod ? {key: at.key, tile: at.tile, plan: null, p: at.p} : null;
        }
        const intents = this._gesture.handle({type: kind, ...at, moveMod, timeMs: event.get_time()});
        for (const i of intents) this._apply(i, kind);
        if (kind === 'release') this._endGrab();
        this.kick();
        return Clutter.EVENT_STOP;
    }

    _endGrab() {
        this._grab?.dismiss();
        this._grab = null;
        this._carry = null;
    }

    _apply(i, kind) {
        const {view, plane} = this._cfg;
        const c = this._carry;
        switch (i.kind) {
        case 'pan': view.panBy(i.last, i.p); break;
        case 'panEnd': view.panEnd(); break;
        case 'rim': view.recenter(); break;
        case 'click':
            if (view.click(i.tile) === 'enter') this._enter(i.tile);
            break;
        case 'carry':
            c.tile = i.tile;
            c.plan = plane.planDrag(i.key, i.tile, i.from);
            view.carry({key: c.key, p: c.p, tile: c.tile, plan: c.plan.change});
            break;
        case 'hold':
            c.p = i.p;
            view.carry({key: c.key, p: c.p, tile: c.tile, plan: c.plan?.change ?? null});
            break;
        case 'drop':
            view.drop((c.plan ?? plane.planDrag(i.key, i.tile, i.from)).commit());
            break;
        case 'cancelCarry':
            if (kind === 'motion' && c) { c.tile = null; c.plan = null; view.carry({key: c.key, p: c.p, tile: null, plan: null}); } else view.carry(null);
            break;
        }
    }

    _enter(tile) {
        this._activate(this._workspaceOn(tile));
        this._cfg.hideOverview();
    }

    /** The workspace on `tile`, opening one there if it has none. */
    _workspaceOn(tile) { return this._cfg.plane.at(tile) ?? this._cfg.windowMoves.openOn(tile); }

    // DND target for window previews over any reachable tile. Neighbor Workspace actors stop being drop
    // targets once the focused tile size makes them unreactive, so the plane owns every drop.
    handleDragOver(source, _actor, x, y) {
        const tile = this._dropTile(source, x, y);
        const r = this._cfg.dragResult;
        return tile === null ? r.CONTINUE : r.MOVE_DROP;
    }

    acceptDrop(source, _actor, x, y) {
        const tile = this._dropTile(source, x, y);
        if (tile === null) return false;
        const ok = this._cfg.windowMoves.dropOn(source.metaWindow, tile);
        this.kick();
        return ok;
    }

    _dropTile(source, x, y) {
        if (!source.metaWindow) return null;
        const [, lx, ly] = this.transform_stage_point(x, y);
        const tile = this._tileAt(lx, ly);
        if (tile === null || tile === undefined || !this._reach.has(tile)) return null;
        if (this._cfg.plane.at(tile) === source.metaWindow.get_workspace()) return null;
        return tile;
    }

    _tileAt(x, y) { return this._frame ? this._cfg.disk.tileAt(this._frame.tiles, x, y, this._disk) : null; }

    getActiveWorkspace() {
        const ws = this._actors.get(global.workspace_manager.get_active_workspace());
        return ws ?? {hasMaximizedWindows: () => false};
    }

    _activate(ws) {
        this._activated = ws;
        ws.activate(global.get_current_time());
    }

    /** GNOME calls this on every close (Escape, Super, a hide, a swipe): enter the focused workspace. */
    prepareToLeaveOverview() {
        const f = this._cfg.view.focus;
        if (global.workspace_manager.get_active_workspace() === this._activated) {
            const ws = f.kind === 'ws' ? f.key : this._workspaceOn(f.tile);
            if (ws !== this._activated) this._activate(ws);
        }
        for (const ws of this._actors.values()) ws.prepareToLeaveOverview(); }
    /** @param {number[]} stackIndices */
    syncStacking(stackIndices) { for (const ws of this._actors.values()) ws.syncStacking(stackIndices); }
    startTouchGesture() {}
    endTouchGesture() {}

    _onDestroy() {
        this._destroyed = true;
        if (this._later) global.compositor.get_laters().remove(this._later);
        this._later = 0;
        this._endGrab();
        this._cfg.view.carry(null);
        this._actors.clear();
    }
});
