// Typed view over GSettings. Read on start, watched for changes.
export class Settings {
    /** @param {object} gsettings  Extension.getSettings() */
    constructor(gsettings) { throw new Error('not implemented'); }
    /** Clutter.ModifierType mask for workspace drag; default SUPER. @returns {number} */
    get moveModifier() { throw new Error('not implemented'); }
    /** Until the disk question is answered. @returns {'klein'|'fitted'|'poincare-shader'} */
    get diskModel() { throw new Error('not implemented'); }
    /** @returns {boolean} PgUp/PgDn activate (GNOME) instead of only moving focus (demo, default false) */
    get pageKeysActivate() { throw new Error('not implemented'); }
}
