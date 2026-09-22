# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Quick Settings toggle for grayscale with configurable intensity (0–100 %).
- Schedule with start/end times in minutes, edited inline in the Quick Settings
  menu (hour/minute blocks with per-unit arrows).
- AM/PM display that follows the system clock format (`12h`/`24h`).
- Smooth transitions: 2 s fade-in, 1 s fade-out, interruption-safe.
- Preferences window (schedule times and intensity slider).

### Changed
- Extension is now fully self-contained: internal GLib timer replaces systemd
  user timers and shell scripts. No external dependencies.
- User strings moved to English source with Spanish (`es`) translation.

## [1.1] - 2026-09-21

### Added
- Initial public-worthy MVP: grayscale toggle, schedule, intensity persistence.

[Unreleased]: https://github.com/REMR11/GrayscaleSchedule/compare/v1.1...HEAD
[1.1]: https://github.com/REMR11/GrayscaleSchedule/releases/tag/v1.1