# WOLE — Android WOL Relay over HTTP

Android foreground service written with Expo + React Native that exposes a lightweight HTTP endpoint reachable on your LAN or VPN and relays Wake-on-LAN (WOL) packets to devices on the local Wi‑Fi. Think of it as an “UpSnap for Android” companion that runs directly on your phone so you can trigger WOL reliably — over LAN, a VPN like Tailscale/WireGuard/ZeroTier, or even via a port‑forward (not recommended).

Note: This project is inspired by the UpSnap concept, but “UpSnap” is not our product name. We are not affiliated with or endorsed by the UpSnap maintainers.

## Features

- Foreground service powered by `react-native-background-actions` keeps the HTTP server alive while the app is backgrounded.
 - Listens for `POST /wol` requests from authorized clients.
- Authenticates requests with a shared secret token.
 - Sends WOL magic packets via UDP broadcast (defaults to `255.255.255.255` if no IP is provided).
- Simple UI to configure the listening port, shared secret, and review relay logs.
- Helper shortcut to open Android battery optimization settings so the service is not killed.

## Why “the UpSnap for Android”?

- Mobile‑first: Runs as an Android foreground service, keeping the relay available while your device is on.
- Flexible access: Works over local Wi‑Fi/LAN, common VPNs (e.g., Tailscale, WireGuard, ZeroTier), or with a port‑forward (with care).
 - Interop‑friendly: Simple `POST /wol` form endpoint compatible with common WOL tools and automations.

## Networking Model

- Local HTTP server runs on your phone at `http://<phone-ip>:<port>`.
- Same network: Use the phone’s LAN IP.
- Remote networks: Use a VPN (e.g., Tailscale/WireGuard/ZeroTier) to reach the phone’s VPN IP; or port‑forward to the phone on your router/firewall (not recommended).
- WOL packets are broadcast on the phone’s current Wi‑Fi/LAN. The phone must be on the same LAN as the target machine you want to wake.
- Cellular‑only cannot wake devices on your home LAN unless the phone is also connected to that LAN (e.g., via a VPN that bridges to the LAN).

## Getting Started

```bash
npm install
```

### Expo prebuild (required for native modules)

This project uses native modules, so you need to generate the Android native project once before building or running on device/emulator:

```bash
npx expo prebuild -p android
```

Subsequent changes to native configuration (e.g., Android permissions) require re-running the prebuild. After the prebuild you can launch the app:

```bash
npx expo run:android
```

### Build the Web UI (required before building a release APK)

The Android app serves the bundled Vite web UI from `android/app/src/main/assets/web`. Build it before producing a release APK (and whenever the web UI changes):

```bash
# Option A: from the web folder
cd web && npm install && npm run build

# Option B: from repo root (convenience script)
npm run build:web
```

This writes static files to `android/app/src/main/assets/web/` as configured in `web/vite.config.js`.

When the app is running, open `http://<phone-ip-or-vpn-ip>:<port>/` to use the built‑in web UI for adding devices and triggering wakes.

### Build an Android APK (release)

```bash
# Ensure native project exists and web UI is built
npx expo prebuild -p android
npm run build:web

# Build release APK/AAB using Gradle
cd android
# On macOS/Linux
./gradlew assembleRelease
# On Windows
gradlew.bat assembleRelease
```

## In-app Configuration

- **Listen Port** – TCP port for the embedded HTTP server (default `8080`).
- **Shared Secret Token** – clients must include this token via `X-Auth-Token` header or `?token=...` query parameter.
- **Battery Optimization Settings** – opens Android settings so you can exclude the app from battery optimizations (recommended).

## Wake Request Format

Send requests from any client that can reach the phone (LAN, VPN peer, or a carefully restricted port‑forward):

```bash
curl -X POST "http://<phone-ip-or-vpn-ip>:<port>/wol" \
  -H "X-Auth-Token: your-shared-secret" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "mac=AA:BB:CC:DD:EE:FF&ip=192.168.1.255&port=9"
```

- `mac` (required): target device MAC address (accepts `:`/`-`).
- `ip` (optional): UDP broadcast IP. Defaults to `255.255.255.255` if omitted.
- `port` (optional): UDP port for the magic packet (defaults to `9`).
- Auth: Provide the token via `X-Auth-Token` header or `?token=...` query parameter (if a token is configured in the app). If no token is set, the endpoint is open.

### Successful Response

- 200 OK with a short text body like: `Sent WOL to aa:bb:cc:dd:ee:ff via 192.168.1.255:9`.
- 400/401 on error with a text or JSON error body.

## API Reference

- `POST /wol`
  - Form body: `mac`, optional `ip`, optional `port`. Auth via `X-Auth-Token` or `?token=`.
  - Response: 200 text on success; 400/401 on errors.
- `GET /health`
  - Simple health check returns `ok` text.
- `GET /api/devices`
  - Returns JSON array of saved devices: `{ id, name, mac, ip, port }[]`.
- `POST /api/devices`
  - JSON body: `{ id?, name, mac, ip="255.255.255.255", port=9 }`. Creates or updates a device. Returns `{ id }`.
- `DELETE /api/devices/:id`
  - Deletes a saved device. Returns `{ ok: true }`.
- `GET /api/dev-proxy`
  - Returns `{ enabled, url }` for dev proxy config.
- `POST /api/dev-proxy`
  - JSON body: `{ enabled: boolean, url: string }`. When enabled (debug builds or explicitly), static requests proxy to a Vite dev server (e.g., `http://10.0.2.2:5173`).

## Foreground Service & Permissions

- Android 13+ requires the runtime `POST_NOTIFICATIONS` permission before a foreground service can show its notification. The app now requests this before starting the relay.
- The Android manifest declares the background actions service with `foregroundServiceType="dataSync"` and includes `FOREGROUND_SERVICE` (and on Android 14, `FOREGROUND_SERVICE_DATA_SYNC`).
- If you prebuild again with Expo, re-run `npx expo prebuild -p android` after changing permissions.

## Auto‑Start on Boot

- Starting the relay from the app enables auto‑start on boot. Stopping the relay disables it.
- The service runs as a foreground service with a persistent notification while active.

## Remote Access Options

- VPNs: Tailscale, WireGuard, or ZeroTier are convenient, secure ways to reach the phone without public exposure.
- LAN only: Use the phone’s LAN IP when on the same Wi‑Fi.
- Port‑forwarding: Possible but not recommended; if used, restrict by IP, require the shared token, and prefer additional network controls (firewall rules, allowlists).

## Development Tips

- Use the in-app event log to verify incoming requests and WOL dispatch results.
- If the Wi‑Fi network changes, restart the relay to ensure correct interface state.
- When debugging HTTP requests, tools like `httpie` or `curl` work well over your chosen network path (LAN/VPN).

## Contributing

See `CONTRIBUTING.md` for development setup, coding style, testing tips, and PR guidelines.

## Security

Please report vulnerabilities privately. Do not open public issues. See `SECURITY.md` for details.

## Code of Conduct

Participation in this project is governed by `CODE_OF_CONDUCT.md`.

## License

MIT — see `LICENSE` for full text.
