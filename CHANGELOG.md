# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.6] – 2026-02-13

### Added
- Device online/offline status via ICMP ping (`POST /api/ping` endpoint).
- `pingIp` field on devices for reachability checks (separate from WOL broadcast IP).
- Status indicators (green/red/gray dot) on web UI device cards with 30-second auto-polling.
- Manual refresh button in web UI header.
- Fallback HTML updated with status column and `pingIp` form field.

## [0.1.5] – 2026-02-12

### Fixed
- Added error handling and logging to boot receiver.

## [0.1.4] – 2026-02-12

### Changed
- Enabled Gradle build cache for faster CI builds.

## [0.1.3] – 2026-02-12

### Changed
- Optimised Android build with Gradle caching and parallel execution.

## [0.1.2] – 2026-02-12

### Added
- GitHub Actions workflow for automated APK releases.
- Release documentation (`RELEASE.md`).

### Fixed
- Build configuration fixes for release workflow.

## [0.1.1] – 2026-02-12

### Added
- GitHub Actions workflow (initial iteration).

## [0.1.0] – 2026-02-12

### Added
- File-based logging for Android service and boot receiver.
- In-app log viewer with clear functionality.
- Redesigned web UI with animated device cards, modals, and improved error handling.
- Project guidelines (`AGENTS.md`), emulator setup docs, and automated setup script.

## [0.0.1] – Initial Release

### Added
- Expo/React Native Android foreground service to relay Wake-on-LAN requests.
- HTTP `POST /wol` endpoint with shared token authentication.
- UDP WOL broadcast with configurable broadcast IP and port.
- Vite-based web UI packaged into Android assets.
- Device management API (`GET/POST/DELETE /api/devices`).
- Auto-start on boot via `BootCompletedReceiver`.
- Battery optimization settings shortcut.
