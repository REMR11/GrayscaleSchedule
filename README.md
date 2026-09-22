# Grayscale Schedule

GNOME Shell extension that toggles screen grayscale from Quick Settings, with a
scheduled start/end time and adjustable intensity. For GNOME 50.

## Features

- One-click grayscale toggle from the system **Quick Settings** panel.
- **Schedule**: enable/disable automatically at *start* and *end* times.
  - Times are edited **inline in the menu** (click or use the arrows on each
    hour/minute block).
  - Windows that cross midnight (e.g. `21:00` → `05:00`) are supported.
  - If the system clock uses the 12 h format, times show with AM/PM.
- **Intensity** slider (100 % = full grayscale, lower = partial desaturation).
- Smooth 2 s fade-in / 1 s fade-out, interruption-safe.
- No external dependencies: works entirely with GNOME Shell APIs.

## Installation

### From the repo (development)

```sh
git clone https://github.com/REMR11/GrayscaleSchedule
cd GrayscaleSchedule
gnome-extensions pack --gettext-domain=grayscale-schedule -o dist/ .
gnome-extensions install dist/grayscale-schedule@remr11.github.com.shell-extension.zip
# log out and back in, then:
gnome-extensions enable grayscale-schedule@remr11.github.com
```

Installing from a source checkout instead of the packed zip needs the compiled
translations first:

```sh
mkdir -p locale/es/LC_MESSAGES
msgfmt po/es.po -o locale/es/LC_MESSAGES/grayscale-schedule.mo
```

The `locale/` directory is gitignored (build output); the zip built with
`--gettext-domain` already contains it.

### From extensions.gnome.org

Install from the [extensions.gnome.org](https://extensions.gnome.org) page (once published).

## Usage

1. Open the Quick Settings menu and find **Grayscale**.
2. Toggle it on/off, or enable **Schedule** and set the start/end times.
3. Adjust **intensity** — changes apply immediately while grayscale is active.

## Manual verification checklist

After a change that touches scheduling or animation, log out and back in, then:

1. Toggle on/off from Quick Settings; confirm the 2 s / 1 s fade.
2. Drag the intensity slider while grayscale is ON; the effect updates live.
3. Set *Start* to ~2 minutes from now with the schedule enabled; confirm it
   turns on by itself, and that a manual toggle within the window is respected
   until the next schedule boundary.
4. Sleep/resume the session inside an active window; state must re-evaluate.
5. Flip the clock format (`gsettings set org.gnome.desktop.interface clock-format 12h`)
   and check that the menu shows AM/PM.

## Contributing

- New strings must go through `gettext`. Source language is English; translations
  live in `po/`. Update with:

  ```sh
  xgettext --from-code=UTF-8 -o po/grayscale-schedule.pot \
    --keyword=gettext:1 --keyword=_ --keyword=C_:1c,2 --package-name=grayscale-schedule \
    $(cat po/POTFILES.in)
  msgmerge -U po/es.po po/grayscale-schedule.pot
  ```

- Report bugs on the [issue tracker](https://github.com/REMR11/GrayscaleSchedule/issues).

## License

GPL-3.0-only. See [LICENSE](LICENSE).