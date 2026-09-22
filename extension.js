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
        this._animSource = null;

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
        this._prefs.connectObject('changed::strength', () => this._syncSlider(), this);
        this._prefs.connectObject('changed::start-hour', () => this._applySchedule(), this);
        this._prefs.connectObject('changed::end-hour', () => this._applySchedule(), this);
        this._prefs.connectObject('changed::enable-schedule', () => this._applySchedule(), this);

        this._sync();
        this._syncSlider();
        this._applySchedule();
        this._persistSaturation();

        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator, 1);
    }

    disable() {
        this._cancelAnimation();
        this._a11y.disconnectObject(this);
        this._mag.disconnectObject(this);
        this._prefs.disconnectObject(this);
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
            this._persistSaturation();
            if (this._a11y.get_boolean('screen-magnifier-enabled'))
                this._apply(true);
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
        const box = new St.BoxLayout({style: 'spacing: 4px'});
        box.add_child(new St.Label({text: title}));

        const timeLabel = new St.Label({
            text: this._fmtTimeFromPrefs(hourKey, minuteKey),
            reactive: true,
            accessible_name: `${title}. ${this.gettext('Clic para sumar una hora')}`,
        });
        if (hourKey === 'start-hour')
            this._startTimeLabel = timeLabel;
        else
            this._endTimeLabel = timeLabel;
        timeLabel.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                this._prefs.set_int(hourKey, (this._prefs.get_int(hourKey) + 1) % 24);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        const arrows = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
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
            btn.connect('clicked', () => {
                let h = this._prefs.get_int(hourKey);
                let m = this._prefs.get_int(minuteKey) + delta;
                if (m < 0) {
                    m = 59;
                    h = (h + 23) % 24;
                } else if (m > 59) {
                    m = 0;
                    h = (h + 1) % 24;
                }
                this._prefs.set_int(hourKey, h);
                this._prefs.set_int(minuteKey, m);
            });
            return btn;
        };
        arrows.add_child(mkArrow('pan-up-symbolic', 1));
        arrows.add_child(mkArrow('pan-down-symbolic', -1));

        box.add_child(timeLabel);
        box.add_child(arrows);
        return box;
    }

    _fmtTime(h, m) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    _fmtTimeFromPrefs(hourKey, minuteKey) {
        return this._fmtTime(this._prefs.get_int(hourKey),
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

        if (this._startTimeLabel) {
            this._startTimeLabel.text = this._fmtTimeFromPrefs('start-hour', 'start-minute');
            this._endTimeLabel.text = this._fmtTimeFromPrefs('end-hour', 'end-minute');
        }
        if (this._scheduleSwitch)
            this._scheduleSwitch.state = enabled;

        if (enabled) {
            const script = `${GLib.get_home_dir()}/.local/bin/set-grayscale-schedule.sh`;
            const start = this._fmtTimeFromPrefs('start-hour', 'start-minute');
            const end = this._fmtTimeFromPrefs('end-hour', 'end-minute');
            this._spawn(['bash', '-c', `${script} '${start}' '${end}'`]);
        } else {
            this._spawn(['systemctl', '--user', 'stop', 'grayscale-on.timer', 'grayscale-off.timer']);
        }
    }

    _spawn(argv) {
        try {
            Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
        } catch (e) {
            console.warn(`grayscale-toggle: no pude ejecutar ${argv[0]}: ${e}`);
        }
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
            this._persistSaturation();
            this._animateSaturation(this._mag.get_double('color-saturation'), target,
                () => {
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

    _persistSaturation() {
        try {
            const conf = `${GLib.get_home_dir()}/.config/grayscale-toggle.conf`;
            GLib.mkdir_with_parents(`${GLib.get_home_dir()}/.config`, 0o755);
            GLib.file_set_contents(conf, `saturation=${this._targetSaturation()}\n`);
        } catch (e) {
            console.warn(`grayscale-toggle: no pude guardar la intensidad: ${e}`);
        }
    }

    _animateSaturation(from, to, done) {
        if (from === to) {
            if (done)
                done();
            return;
        }
        this._cancelAnimation();
        const steps = Math.max(1, Math.round(Math.abs(to - from) / 0.02));
        const interval = 40;
        const delta = (to - from) / steps;
        let i = 0;
        this._animSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
            i++;
            this._mag.set_double('color-saturation', i >= steps ? to : from + delta * i);
            if (i >= steps) {
                this._animSource = null;
                if (done)
                    done();
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _cancelAnimation() {
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