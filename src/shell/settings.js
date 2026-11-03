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
    /** Until the disk question is answered; read once on enable. @returns {'klein'|'fitted'|'poincare-shader'} */
    get diskModel() { return this._s.get_string('disk-model'); }
    /** @returns {boolean} PgUp/PgDn activate (GNOME) instead of only moving focus (demo, default false) */
    get pageKeysActivate() { return this._s.get_boolean('page-keys-activate'); }
}
