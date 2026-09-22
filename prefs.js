import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class GrayscaleTogglePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        const scheduleGroup = new Adw.PreferencesGroup({
            title: _('Horario'),
            description: _('Cuándo se activa y desactiva la escala de grises automáticamente'),
        });
        page.add(scheduleGroup);

        const scheduleToggle = new Adw.SwitchRow({
            title: _('Usar horario'),
            subtitle: _('Activa la escala de grises a la hora de inicio y la desactiva a la hora de fin'),
        });
        settings.bind('enable-schedule', scheduleToggle, 'active', Gio.SettingsBindFlags.DEFAULT);
        scheduleGroup.add(scheduleToggle);

        scheduleGroup.add(this._buildTimeRow(_('Inicio'),
            _('Hora a la que se activa el modo'), settings, 'start-hour', 'start-minute'));
        scheduleGroup.add(this._buildTimeRow(_('Fin'),
            _('Hora a la que se desactiva el modo'), settings, 'end-hour', 'end-minute'));

        const intensityGroup = new Adw.PreferencesGroup({
            title: _('Intensidad'),
            description: _('Qué tan fuerte es el efecto de escala de grises'),
        });
        page.add(intensityGroup);

        const strengthRow = new Adw.ActionRow({
            title: _('Escala de grises'),
            subtitle: _('100 es gris total, menor valor es una desaturación parcial'),
        });
        const scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 100, 1);
        scale.valign = Gtk.Align.CENTER;
        scale.set_size_request(220, -1);
        settings.bind('strength', scale.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        strengthRow.add_suffix(scale);
        intensityGroup.add(strengthRow);
    }

    _buildTimeRow(title, subtitle, settings, hourKey, minuteKey) {
        const row = new Adw.ActionRow({title, subtitle});

        const fmt = total =>
            `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
        const toTotal = () =>
            settings.get_int(hourKey) * 60 + settings.get_int(minuteKey);

        const spin = new Gtk.SpinButton({
            adjustment: Gtk.Adjustment.new(toTotal(), 0, 1439, 1, 60, 0),
            'width-chars': 5,
            valign: Gtk.Align.CENTER,
        });

        spin.connect('output', () => {
            spin.set_text(fmt(Math.round(spin.get_value())));
            return true;
        });
        spin.connect('input', (entry, text) => {
            const m = /^(\d{1,2}):(\d{2})$/.exec(text ?? '');
            if (m) {
                const h = Number(m[1]);
                const min = Number(m[2]);
                if (h <= 23 && min <= 59) {
                    entry.set_value(h * 60 + min);
                    return 1;
                }
            }
            return -1;
        });
        spin.connect('value-changed', () => {
            const total = Math.round(spin.get_value());
            settings.set_int(hourKey, Math.floor(total / 60));
            settings.set_int(minuteKey, total % 60);
        });

        const updateSpin = () => spin.set_value(toTotal());
        settings.connect(`changed::${hourKey}`, updateSpin);
        settings.connect(`changed::${minuteKey}`, updateSpin);

        row.add_suffix(spin);
        return row;
    }
}