// Typed view over GSettings. Getters read the live value, so a change applies on the next use.
import Clutter from 'gi://Clutter';

const MODIFIERS = {
    super: Clutter.ModifierType.SUPER_MASK | Clutter.ModifierType.MOD4_MASK,
    shift: Clutter.ModifierType.SHIFT_MASK,
    control: Clutter.ModifierType.CONTROL_MASK,
    alt: Clutter.ModifierType.MOD1_MASK,
};

export class Settings {
    /** @param {object} gsettings  Extension.getSettings() */
    constructor(gsettings) { this._s = gsettings; }
    /** Clutter.ModifierType mask for a workspace drag; default super. @returns {number} */
    get moveModifier() { return MODIFIERS[this._s.get_string('move-modifier')] ?? MODIFIERS.super; }
    /** Focused tile size remap: 1 is the plain drawing, 2 is Klein. @returns {number} */
    get focusedTileSize() { return this._s.get_double('focused-tile-size'); }
}
