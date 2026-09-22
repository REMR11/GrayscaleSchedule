import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';

export default class GrayscaleToggleExtension extends Extension {
    enable() {
        if (this._indicator)
            return;

        this._a11y = Gio.Settings.new('org.gnome.desktop.a11y.applications');
        this._mag = Gio.Settings.new('org.gnome.desktop.a11y.magnifier');
        this._prefs = this.getSettings();
        this._desktop = Gio.Settings.new('org.gnome.desktop.interface');
        this._clock24 = this._desktop.get_string('clock-format') === '24h';
        this._animSource = null;
        this._animSeq = 0;
        this._scheduleSource = null;
        this._scheduleActive = null;
        this._unitLabels = {};
        this._ampmLabels = {};

        const icon = new St.Icon({
            icon_name: 'preferences-desktop-accessibility-symbolic',
            style_class: 'system-status-icon',
            reactive: true,
            accessible_name: this.gettext('Escala de grises'),
        });
        icon.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                this._apply(!this._a11y.get_boolean('screen-magnifier-enabled'));
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._indicator = new QuickSettings.SystemIndicator();
        this._indicator.add_child(icon);
        this._indicator.visible = true;

        this._toggle = new QuickSettings.QuickMenuToggle({
            title: this.gettext('Escala de grises'),
            iconName: 'preferences-desktop-accessibility-symbolic',
            toggleMode: true,
        });
        this._checkedId = this._toggle.connect('notify::checked',
            () => this._apply(this._toggle.checked));
        this._buildMenu();

        this._indicator.quickSettingsItems.push(this._toggle);

        this._a11y.connectObject('changed::screen-magnifier-enabled', () => this._sync(), this);
        this._mag.connectObject('changed::color-saturation', () => this._sync(), this);
        this._prefs.connectObject('changed::strength', () => {
            this._syncSlider();
            if (this._a11y.get_boolean('screen-magnifier-enabled'))
                this._apply(true);
        }, this);
        this._prefs.connectObject('changed::start-hour', () => this._applySchedule(), this);
        this._prefs.connectObject('changed::end-hour', () => this._applySchedule(), this);
        this._prefs.connectObject('changed::enable-schedule', () => this._applySchedule(), this);
        this._prefs.connectObject('changed::start-minute', () => this._applySchedule(), this);
        this._prefs.connectObject('changed::end-minute', () => this._applySchedule(), this);
        this._desktop.connectObject('changed::clock-format', () => {
            this._clock24 = this._desktop.get_string('clock-format') === '24h';
            this._applySchedule();
        }, this);

        this._sync();
        this._syncSlider();
        this._applySchedule();

        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator, 1);
    }

    disable() {
        this._cancelAnimation();
        this._stopScheduleTimer();
        this._a11y.disconnectObject(this);
        this._mag.disconnectObject(this);
        this._prefs.disconnectObject(this);
        this._desktop.disconnectObject(this);
        this._indicator?.destroy();
        this._indicator = null;
        this._toggle = null;
        this._menuSlider = null;
    }

    _buildMenu() {
        const menu = this._toggle.menu;
        this._updateHeader();

        const intensity = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            activate: false,
            can_focus: false,
        });
        intensity.add_child(new St.Label({text: this.gettext('Intensidad')}));
        this._menuSlider = new Slider(this._prefs.get_int('strength') / 100);
        this._menuSlider.accessible_name = this.gettext('Intensidad de grises');
        this._menuSlider.connect('notify::value', () => {
            if (this._syncingSlider)
                return;
            let strength = Math.round(this._menuSlider.value * 100);
            strength = Math.max(0, Math.min(100, strength));
            this._prefs.set_int('strength', strength);
        });
        intensity.add_child(this._menuSlider);
        menu.addMenuItem(intensity);

        menu.addMenuItem(this._buildScheduleRow());

        this._scheduleSwitch = new PopupMenu.PopupSwitchMenuItem(
            this.gettext('Horario automático'),
            this._prefs.get_boolean('enable-schedule'));
        this._scheduleSwitch.connect('toggled',
            () => this._prefs.set_boolean('enable-schedule', this._scheduleSwitch.state));
        menu.addMenuItem(this._scheduleSwitch);

        menu.addAction(this.gettext('Abrir configuración'), () => this.openPreferences());
    }

    _buildScheduleRow() {
        const row = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            activate: false,
            can_focus: false,
        });
        const box = new St.BoxLayout({style: 'spacing: 12px'});
        box.add_child(this._buildTimeField(this.gettext('Inicio'),
            'start-hour', 'start-minute'));
        box.add_child(this._buildTimeField(this.gettext('Fin'),
            'end-hour', 'end-minute'));
        row.add_child(box);
        return row;
    }

    _buildTimeField(title, hourKey, minuteKey) {
        const box = new St.BoxLayout({style: 'spacing: 6px'});
        box.add_child(new St.Label({text: title}));
        box.add_child(this._buildSegment(title, hourKey));
        box.add_child(new St.Label({text: ':'}));
        box.add_child(this._buildSegment(title, minuteKey));
        this._ampmLabels[hourKey] = new St.Label({text: ''});
        box.add_child(this._ampmLabels[hourKey]);
        return box;
    }

    _buildSegment(title, unitKey) {
        const box = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style: 'spacing: 1px',
        });
        const label = new St.Label({
            text: unitKey.endsWith('-hour')
                ? this._fmtHour(this._prefs.get_int(unitKey))
                : String(this._prefs.get_int(unitKey)).padStart(2, '0'),
            reactive: true,
            accessible_name: `${title} ${unitKey.endsWith('-hour')
                ? this.gettext('hora') : this.gettext('minuto')}. ${this.gettext('Clic para sumar 1')}`,
        });
        this._unitLabels[unitKey] = label;
        label.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                this._adjustUnit(unitKey, 1);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        const mkArrow = (iconName, delta) => {
            const btn = new St.Button({
                style_class: 'icon-button',
                child: new St.Icon({
                    icon_name: iconName,
                    style_class: 'popup-menu-item',
                }),
                reactive: true,
                can_focus: true,
            });
            btn.connect('clicked', () => this._adjustUnit(unitKey, delta));
            return btn;
        };
        box.add_child(label);
        box.add_child(mkArrow('pan-up-symbolic', 1));
        box.add_child(mkArrow('pan-down-symbolic', -1));
        return box;
    }

    _adjustUnit(unitKey, delta) {
        const current = this._prefs.get_int(unitKey);
        if (unitKey.endsWith('-hour')) {
            this._prefs.set_int(unitKey, (current + delta + 24) % 24);
            return;
        }
        const hourKey = unitKey.replace('-minute', '-hour');
        let h = this._prefs.get_int(hourKey);
        let m = current + delta;
        if (m < 0) {
            m = 59;
            h = (h + 23) % 24;
        } else if (m > 59) {
            m = 0;
            h = (h + 1) % 24;
        }
        this._prefs.set_int(hourKey, h);
        this._prefs.set_int(unitKey, m);
    }

    _fmtHour(h) {
        if (this._clock24)
            return String(h).padStart(2, '0');
        return String(h % 12 || 12).padStart(2, '0');
    }

    _ampmFor(h) {
        return this._clock24 ? '' : (h < 12 ? 'AM' : 'PM');
    }

    _fmtDisplayTime(h, m) {
        const t = `${this._fmtHour(h)}:${String(m).padStart(2, '0')}`;
        return this._clock24 ? t : `${t} ${this._ampmFor(h)}`;
    }

    _fmtTimeFromPrefs(hourKey, minuteKey) {
        return this._fmtDisplayTime(this._prefs.get_int(hourKey),
            this._prefs.get_int(minuteKey));
    }

    _updateHeader() {
        const enabled = this._prefs.get_boolean('enable-schedule');
        const subtitle = enabled
            ? this.gettext('Horario: %s – %s').format(
                this._fmtTimeFromPrefs('start-hour', 'start-minute'),
                this._fmtTimeFromPrefs('end-hour', 'end-minute'))
            : this.gettext('Sin horario');
        this._toggle.menu.setHeader('preferences-desktop-accessibility-symbolic',
            this.gettext('Escala de grises'), subtitle);
    }

    _applySchedule() {
        const enabled = this._prefs.get_boolean('enable-schedule');
        this._updateHeader();

        if (this._unitLabels) {
            for (const key of Object.keys(this._unitLabels)) {
                const value = this._prefs.get_int(key);
                this._unitLabels[key].text = key.endsWith('-hour')
                    ? this._fmtHour(value) : String(value).padStart(2, '0');
            }
            for (const key of Object.keys(this._ampmLabels))
                this._ampmLabels[key].text = this._ampmFor(this._prefs.get_int(key));
        }
        if (this._scheduleSwitch)
            this._scheduleSwitch.state = enabled;

        if (enabled) {
            this._startScheduleTimer();
            this._tickSchedule();
        } else {
            this._stopScheduleTimer();
        }
    }

    _startScheduleTimer() {
        if (this._scheduleSource)
            return;
        this._scheduleActive = this._a11y.get_boolean('screen-magnifier-enabled');
        this._scheduleSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60000,
            () => this._tickSchedule());
    }

    _stopScheduleTimer() {
        if (this._scheduleSource) {
            GLib.source_remove(this._scheduleSource);
            this._scheduleSource = null;
        }
        this._scheduleActive = null;
    }

    // ponytail: tick de 60s en transiciones; si se quiere precisión de segundo
    // se re-arma un timeout para el próximo borde de la ventana.
    _tickSchedule() {
        const active = this._prefs.get_boolean('enable-schedule') && this._inScheduleWindow();
        if (active !== this._scheduleActive) {
            this._scheduleActive = active;
            this._apply(active);
        }
        return GLib.SOURCE_CONTINUE;
    }

    _inScheduleWindow() {
        const start = this._prefs.get_int('start-hour') * 60 + this._prefs.get_int('start-minute');
        const end = this._prefs.get_int('end-hour') * 60 + this._prefs.get_int('end-minute');
        if (start === end)
            return false;
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        return start < end
            ? nowMin >= start && nowMin < end
            : nowMin >= start || nowMin < end;
    }

    _apply(on) {
        if (this._applying)
            return;
        this._applying = true;
        try {
            if (on) {
                this._a11y.set_boolean('screen-magnifier-enabled', true);
                this._mag.set_double('mag-factor', 1.0);
            }
            const target = on ? this._targetSaturation() : 1.0;
            const duration = on ? 2000 : 1000;
            this._animateSaturation(this._mag.get_double('color-saturation'), target,
                duration, () => {
                    if (!on)
                        this._a11y.set_boolean('screen-magnifier-enabled', false);
                });
        } finally {
            this._applying = false;
        }
    }

    _targetSaturation() {
        return (100 - this._prefs.get_int('strength')) / 100;
    }

    _animateSaturation(from, to, durationMs, done) {
        this._cancelAnimation();
        if (from === to) {
            if (done)
                done();
            this._sync();
            return;
        }
        const animId = ++this._animSeq;
        const steps = Math.max(1, Math.round(durationMs / 16));
        const delta = (to - from) / steps;
        let i = 0;
        this._animSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            Math.round(durationMs / steps), () => {
                if (this._animSeq !== animId) {
                    this._animSource = null;
                    return GLib.SOURCE_REMOVE;
                }
                i++;
                const v = i >= steps ? to : from + delta * i;
                this._mag.set_double('color-saturation', v);
                if (i >= steps) {
                    this._animSource = null;
                    if (done)
                        done();
                    this._sync();
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            });
    }

    _cancelAnimation() {
        this._animSeq++;
        if (this._animSource) {
            GLib.source_remove(this._animSource);
            this._animSource = null;
        }
    }

    _sync() {
        if (this._animSource)
            return;
        this._toggle.block_signal_handler(this._checkedId);
        this._toggle.checked = this._a11y.get_boolean('screen-magnifier-enabled');
        this._toggle.unblock_signal_handler(this._checkedId);
    }

    _syncSlider() {
        if (!this._menuSlider)
            return;
        this._syncingSlider = true;
        this._menuSlider.value = this._prefs.get_int('strength') / 100;
        this._syncingSlider = false;
    }
}