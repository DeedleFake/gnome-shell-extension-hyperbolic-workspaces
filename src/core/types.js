// Shared JSDoc types for the pure core. No gi:// import anywhere under core/ or disk/{index,klein,fitted}.js.

/** @typedef {[number, number]} Complex  Poincaré disk point, [re, im], im up (geometry.js convention). */
/** SU(1,1) frame z -> (a z + b)/(conj(b) z + conj(a)). @typedef {{a: Complex, b: Complex}} Frame */
/** Tile id from the Tiling graph. Never reused after a prune. @typedef {number & {__tile: true}} TileId */
/** Quarter turns 0..3: which edge of its tile is a workspace's down. @typedef {0|1|2|3} Edge */

/** Where one workspace sits. Immutable; replaced, never mutated. @typedef {Readonly<{tile: TileId, down: Edge}>} Seat */

/**
 * What the shell tells the plane on every reconcile. K is opaque to the core
 * (Meta.Workspace in the shell, plain objects in tests).
 * @template K
 * @typedef {Readonly<{
 *   order: readonly K[],              GNOME index order, read fresh each time (sequence truth)
 *   hasWindows: (k: K) => boolean,    membership: seated <=> hasWindows || k === active
 *   active: K | null,                 entered workspace: never moved, never removed
 * }>} Snapshot
 */

/**
 * How one workspace moved in one op. `via` present => member of a piece sliding
 * rigidly along slide G (animate with M.slidePow, never turns).
 * @template K
 * @typedef {Readonly<{key: K, from: Seat|null, to: Seat|null, via: {root: TileId, G: Frame}|null}>} Motion
 */

/** Result of every Plane mutation; the only thing ViewState consumes. @template K @typedef {Readonly<{motions: readonly Motion<K>[], center: TileId}>} Change */

/** Focus may be an empty tile (GNOME keeps an empty active workspace). @template K @typedef {{kind: 'ws', key: K} | {kind: 'tile', tile: TileId}} Focus */

/** Keys the plane owns in the Overview. Closed: everything else stays GNOME's. @typedef {'left'|'right'|'up'|'down'|'pageUp'|'pageDown'|'home'} Nav */

/**
 * One frame's drawing input. `content` already includes each workspace's down
 * rotation (F ∘ rot(down·90°)), so no caller ever sees `down`.
 * @template K
 * @typedef {Readonly<{tiles: ReadonlyMap<TileId, Frame>, content: ReadonlyMap<K, Frame>,
 *   rim: {angle: number, opacity: number} | null}>} FrameSet
 */

/** Screen disk in stage px. @typedef {Readonly<{cx: number, cy: number, r: number}>} DiskRect */
/** 3x3 row-major homography, flat box px -> stage px. @typedef {readonly number[]} H3 */

export {};
