# Android WOL Relay via Tailscale

Android foreground service written with Expo + React Native that exposes a lightweight HTTP endpoint over your Tailscale network and relays Wake-on-LAN (WOL) packets to devices on the local Wi-Fi.

## Features

- Foreground service powered by `react-native-background-actions` keeps the HTTP server alive while the app is backgrounded.
- Listens for `POST /wake` requests from authorized Tailscale peers.
- Authenticates requests with a shared secret token.
- Computes the correct UDP broadcast address from the phone's current Wi-Fi network when one is not supplied.
- Sends WOL magic packets via UDP broadcast using `react-native-udp`.
- Simple UI to configure the listening port, shared secret, and review relay logs.
- Helper shortcut to open Android battery optimization settings so the service is not killed.

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

## In-app Configuration

- **Listen Port** – TCP port for the embedded HTTP server (default `8080`).
- **Shared Secret Token** – requests must include this token in the JSON payload.
- **Battery Optimization Settings** – opens Android settings so you can exclude the app from battery optimizations (recommended).

## Wake Request Format

Send requests from any Tailscale peer that is allowed by your ACLs:

```bash
curl -X POST http://<tailscale-ip>:<port>/wake \
  -H "Content-Type: application/json" \
  -d '{
        "mac": "AA:BB:CC:DD:EE:FF",
        "broadcast": "192.168.1.255",
        "port": 9,
        "token": "your-shared-secret"
      }'
```

- `mac` (required): target device MAC address (accepts `:`/`-`/` ` separators).
- `broadcast` (optional): UDP broadcast IP. If omitted, the app calculates it from the current Wi-Fi subnet.
- `port` (optional): UDP port for the magic packet (defaults to `9`).
- `token` (required): must match the shared secret configured in the app.

### Successful Response

```json
{
  "ok": true,
  "mac": "aabbccddeeff",
  "broadcast": "192.168.1.255",
  "port": 9
}
```

Errors return `ok: false` and a descriptive message.

## Foreground Service & Permissions

`app.json` adds the required Android permissions (`INTERNET`, `FOREGROUND_SERVICE`) and declares the notification shown while the foreground service is running. The service badge updates with the latest log entry so you can confirm activity at a glance.

## Tailscale Considerations

- Ensure the Android device is logged into Tailscale and reachable from your peers.
- Use Tailscale ACLs to constrain which devices can reach the relay's port.
- The app does not expose a public IP; it relies on Tailscale's overlay IP (e.g., `100.x.y.z`) for remote access without router port-forwarding.

## Development Tips

- Use the in-app event log to verify incoming requests and WOL dispatch results.
- Restart the relay if the Wi-Fi network changes so the broadcast calculation uses the latest subnet.
- When debugging HTTP requests, tools like `httpie` or `curl` work well over Tailscale.

## License

MIT
