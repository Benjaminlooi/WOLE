package com.anonymous.wolrelay

import android.content.Context
import fi.iki.elonen.NanoHTTPD
import org.json.JSONArray
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class WolServer(
    private val context: Context,
    port: Int = 8080,
    private val sharedToken: String? = null
) : NanoHTTPD("0.0.0.0", port) {

    private val prefs by lazy { context.getSharedPreferences("wol_prefs", Context.MODE_PRIVATE) }

    override fun serve(session: IHTTPSession): Response {
        return try {
            when {
                session.uri == "/wol" -> handleWol(session)
                session.uri == "/health" -> newFixedLengthResponse("ok")
                session.uri == "/api/dev-proxy" && session.method == Method.GET -> getDevProxyConfig(session)
                session.uri == "/api/dev-proxy" && session.method == Method.POST -> setDevProxyConfig(session)
                session.uri == "/api/devices" && session.method == Method.GET -> listDevices(session)
                session.uri == "/api/devices" && session.method == Method.POST -> upsertDevice(session)
                session.uri.startsWith("/api/devices/") && session.method == Method.DELETE -> deleteDevice(session)
                session.uri == "/api/ping" && session.method == Method.POST -> handlePing(session)
                else -> serveStaticOrIndex(session)
            }
        } catch (e: Exception) {
            newJsonResponse(Response.Status.INTERNAL_ERROR, jsonError(e.message ?: "error"))
        }
    }

    private fun serveStaticOrIndex(session: IHTTPSession): Response {
        // Serve built web assets from android/app/src/main/assets/web (packaged as assets/web)
        // SPA fallback to index.html when path not found and method is GET
        if (session.method != Method.GET) {
            return newJsonResponse(Response.Status.METHOD_NOT_ALLOWED, jsonError("Use correct method"))
        }

        // In dev, optionally proxy to a Vite dev server (e.g. http://10.0.2.2:5173)
        if (shouldProxyToDev()) {
            proxyToDev(session)?.let { return it }
        }

        val path = sanitizePath(session.uri)
        val tryFiles = mutableListOf<String>()
        if (path == "/" || path.isEmpty()) {
            tryFiles.add("web/index.html")
        } else {
            tryFiles.add("web${path}")
        }

        // Vite may reference "/assets/..." and other files; we try the direct path first
        for (assetPath in tryFiles) {
            serveAsset(assetPath)?.let { return it }
        }

        // SPA fallback to index.html for non-API routes
        serveAsset("web/index.html")?.let { return it }

        // If assets are not packaged yet, fall back to embedded minimal HTML
        return newFixedLengthResponse(Response.Status.OK, "text/html; charset=utf-8", indexHtml)
    }

    private fun shouldProxyToDev(): Boolean {
        // Only allow in debug builds or when explicitly enabled, to be safe.
        val enabled = prefs.getBoolean("dev_proxy_enabled", false)
        return try {
            val debug = com.anonymous.wolrelay.BuildConfig.DEBUG
            (debug || enabled) && !devServerBase().isNullOrBlank()
        } catch (_: Throwable) {
            enabled && !devServerBase().isNullOrBlank()
        }
    }

    private fun devServerBase(): String? {
        // Default to Android emulator host if not set
        val def = "http://10.0.2.2:5173"
        val s = prefs.getString("dev_proxy_url", def)
        return s?.trim()?.ifEmpty { null }
    }

    private fun proxyToDev(session: IHTTPSession): Response? {
        try {
            val base = devServerBase() ?: return null
            val path = sanitizePath(session.uri)
            val qs = try { session.queryParameterString } catch (_: Exception) { null }
            val fullUrl = if (!qs.isNullOrBlank()) "$base$path?$qs" else "$base$path"

            val url = URL(fullUrl)
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = session.method.name
                instanceFollowRedirects = false
                connectTimeout = 3000
                readTimeout = 10000
                doInput = true
            }

            // We only proxy GETs here, others are handled by API routes
            conn.connect()
            val code = conn.responseCode
            val mime = conn.getHeaderField("Content-Type") ?: guessMime(path)
            val input = try { conn.inputStream } catch (_: Exception) { conn.errorStream }
            input?.use { stream ->
                val bytes = stream.readBytes()
                val resp = newFixedLengthResponse(Response.Status.lookup(code), mime, bytes.inputStream(), bytes.size.toLong())
                // propagate caching headers lightly to help dev
                listOf("Cache-Control", "ETag", "Last-Modified").forEach { h ->
                    conn.getHeaderField(h)?.let { v -> resp.addHeader(h, v) }
                }
                return resp
            }
            return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", "Proxy error")
        } catch (_: Exception) {
            // If proxy fails (dev server not running), fall back to assets/indexHtml
            return null
        }
    }

    private fun sanitizePath(uri: String): String {
        var p = uri.trim()
        if (!p.startsWith('/')) p = "/$p"
        // Disallow path traversal and convert backslashes
        p = p.replace('\\', '/').replace("..", "")
        return p
    }

    private fun serveAsset(assetPath: String): Response? {
        return try {
            context.assets.open(assetPath).use { input ->
                val bytes = input.readBytes()
                val mime = guessMime(assetPath)
                val stream = java.io.ByteArrayInputStream(bytes)
                newFixedLengthResponse(Response.Status.OK, mime, stream, bytes.size.toLong())
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun guessMime(path: String): String {
        val lower = path.lowercase(Locale.US)
        return when {
            lower.endsWith(".html") || lower.endsWith(".htm") -> "text/html; charset=utf-8"
            lower.endsWith(".css") -> "text/css; charset=utf-8"
            lower.endsWith(".js") -> "application/javascript; charset=utf-8"
            lower.endsWith(".mjs") -> "application/javascript; charset=utf-8"
            lower.endsWith(".map") -> "application/json; charset=utf-8"
            lower.endsWith(".json") -> "application/json; charset=utf-8"
            lower.endsWith(".svg") -> "image/svg+xml"
            lower.endsWith(".png") -> "image/png"
            lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
            lower.endsWith(".gif") -> "image/gif"
            lower.endsWith(".ico") -> "image/x-icon"
            lower.endsWith(".webp") -> "image/webp"
            lower.endsWith(".wasm") -> "application/wasm"
            lower.endsWith(".txt") -> "text/plain; charset=utf-8"
            else -> "application/octet-stream"
        }
    }

    private fun isAuthorized(session: IHTTPSession): Boolean {
        val token = sharedToken?.trim().orEmpty()
        if (token.isEmpty()) return true
        val header = session.headers["x-auth-token"] ?: ""
        val query = session.parameters["token"]?.firstOrNull() ?: ""
        return header == token || query == token
    }

    private fun handleWol(session: IHTTPSession): Response {
        if (!isAuthorized(session)) return unauthorized()
        if (session.method != Method.POST) return methodNotAllowed()

        session.parseBody(mutableMapOf())
        val parms = session.parameters
        val mac = parms["mac"]?.firstOrNull()?.trim().orEmpty()
        val ip = parms["ip"]?.firstOrNull()?.trim().ifNullOrBlank { "255.255.255.255" }
        val port = parms["port"]?.firstOrNull()?.trim()?.toIntOrNull() ?: 9
        if (mac.isBlank()) return badRequest("Missing mac")

        sendWol(mac, ip!!, port)
        return newTextResponse(Response.Status.OK, "Sent WOL to $mac via $ip:$port")
    }

    private fun listDevices(session: IHTTPSession): Response {
        if (!isAuthorized(session)) return unauthorized()
        val arr = loadDevices()
        return newJsonResponse(Response.Status.OK, arr)
    }

    private fun upsertDevice(session: IHTTPSession): Response {
        if (!isAuthorized(session)) return unauthorized()
        val files = mutableMapOf<String, String>()
        session.parseBody(files)
        val body = files["postData"] ?: return badRequest("Missing body")
        val json = try { JSONObject(body) } catch (e: Exception) { return badRequest("Invalid JSON") }

        val id = json.optString("id").ifBlank { UUID.randomUUID().toString() }
        val name = json.optString("name")
        val mac = json.optString("mac")
        val ip = json.optString("ip", "255.255.255.255")
        val port = json.optInt("port", 9)
        val pingIp = json.optString("pingIp", "")
        if (name.isBlank() || mac.isBlank()) return badRequest("Missing name/mac")

        val arr = loadDevices()
        var updated = false
        for (i in 0 until arr.length()) {
            val obj = arr.getJSONObject(i)
            if (obj.optString("id") == id) {
                obj.put("name", name)
                obj.put("mac", mac)
                obj.put("ip", ip)
                obj.put("port", port)
                obj.put("pingIp", pingIp)
                updated = true
                break
            }
        }
        if (!updated) {
            val obj = JSONObject()
            obj.put("id", id)
            obj.put("name", name)
            obj.put("mac", mac)
            obj.put("ip", ip)
            obj.put("port", port)
            obj.put("pingIp", pingIp)
            arr.put(obj)
        }
        saveDevices(arr)
        return newJsonResponse(Response.Status.OK, JSONObject().put("id", id))
    }

    private fun deleteDevice(session: IHTTPSession): Response {
        if (!isAuthorized(session)) return unauthorized()
        val id = session.uri.substringAfterLast('/')
        if (id.isBlank()) return badRequest("Missing id")
        val arr = loadDevices()
        val filtered = JSONArray()
        for (i in 0 until arr.length()) {
            val obj = arr.getJSONObject(i)
            if (obj.optString("id") != id) filtered.put(obj)
        }
        saveDevices(filtered)
        return newJsonResponse(Response.Status.OK, JSONObject().put("ok", true))
    }

    private fun sendWol(mac: String, broadcastIp: String, port: Int) {
        val cleaned = mac.replace("-", ":").lowercase(Locale.US)
        val parts = cleaned.split(":")
        require(parts.size == 6) { "Invalid MAC" }
        val macBytes = ByteArray(6) { i -> parts[i].toInt(16).toByte() }

        val packet = ByteArray(6 + 16 * 6)
        for (i in 0 until 6) packet[i] = 0xFF.toByte()
        for (i in 0 until 16) System.arraycopy(macBytes, 0, packet, 6 + i * 6, 6)

        DatagramSocket().use { socket ->
            socket.broadcast = true
            val address = InetAddress.getByName(broadcastIp)
            val dp = DatagramPacket(packet, packet.size, address, port)
            socket.send(dp)
        }
    }

    private fun handlePing(session: IHTTPSession): Response {
        if (!isAuthorized(session)) return unauthorized()
        val files = mutableMapOf<String, String>()
        return try {
            session.parseBody(files)
            val body = files["postData"] ?: return badRequest("Missing body")
            val json = JSONObject(body)

            // Accept either { "ip": "..." } or { "ips": ["...", ...] }
            val ips = mutableListOf<String>()
            if (json.has("ip")) {
                json.optString("ip").trim().takeIf { it.isNotEmpty() }?.let { ips.add(it) }
            }
            if (json.has("ips")) {
                val arr = json.optJSONArray("ips")
                if (arr != null) {
                    for (i in 0 until arr.length()) {
                        arr.optString(i).trim().takeIf { it.isNotEmpty() }?.let { ips.add(it) }
                    }
                }
            }
            if (ips.isEmpty()) return badRequest("Missing ip or ips")

            // Ping all IPs concurrently
            val results = JSONObject()
            val executor = Executors.newFixedThreadPool(ips.size.coerceAtMost(8))
            val futures = ips.map { ip ->
                executor.submit<Pair<String, Boolean>> {
                    ip to pingHost(ip)
                }
            }
            for (future in futures) {
                try {
                    val (ip, reachable) = future.get(5, TimeUnit.SECONDS)
                    results.put(ip, reachable)
                } catch (_: Exception) {
                    // Timeout or error — mark as unreachable
                }
            }
            executor.shutdown()

            newJsonResponse(Response.Status.OK, JSONObject().put("results", results))
        } catch (e: Exception) {
            badRequest("Invalid request: ${e.message}")
        }
    }

    private fun pingHost(ip: String): Boolean {
        return try {
            // Sanitize: only allow IP-like characters to prevent command injection
            val sanitized = ip.replace(Regex("[^0-9a-fA-F.:]"), "")
            if (sanitized.isEmpty()) return false

            val process = Runtime.getRuntime().exec(arrayOf("ping", "-c", "1", "-W", "1", sanitized))
            val exited = process.waitFor()
            exited == 0
        } catch (_: Exception) {
            false
        }
    }

    private fun loadDevices(): JSONArray {
        val s = prefs.getString("devices", "[]") ?: "[]"
        return try { JSONArray(s) } catch (_: Exception) { JSONArray() }
    }

    private fun saveDevices(arr: JSONArray) {
        prefs.edit().putString("devices", arr.toString()).apply()
    }

    private fun newJsonResponse(status: Response.Status, json: Any): Response {
        val body = when (json) {
            is JSONObject -> json.toString()
            is JSONArray -> json.toString()
            else -> JSONObject().put("ok", false).put("error", json.toString()).toString()
        }
        return newFixedLengthResponse(status, "application/json; charset=utf-8", body)
    }

    private fun newTextResponse(status: Response.Status, text: String): Response =
        newFixedLengthResponse(status, "text/plain; charset=utf-8", text)

    private fun badRequest(msg: String): Response = newJsonResponse(
        Response.Status.BAD_REQUEST, jsonError(msg)
    )

    private fun methodNotAllowed(): Response = newJsonResponse(
        Response.Status.METHOD_NOT_ALLOWED, jsonError("Use correct method")
    )

    private fun unauthorized(): Response = newJsonResponse(
        Response.Status.UNAUTHORIZED, jsonError("Unauthorized")
    )

    private fun jsonError(msg: String): JSONObject = JSONObject().put("ok", false).put("error", msg)

    private fun getDevProxyConfig(session: IHTTPSession): Response {
        if (!isAuthorized(session)) return unauthorized()
        val obj = JSONObject()
            .put("enabled", shouldProxyToDev())
            .put("url", devServerBase() ?: JSONObject.NULL)
        return newJsonResponse(Response.Status.OK, obj)
    }

    private fun setDevProxyConfig(session: IHTTPSession): Response {
        if (!isAuthorized(session)) return unauthorized()
        val files = mutableMapOf<String, String>()
        return try {
            session.parseBody(files)
            val body = files["postData"] ?: return badRequest("Missing body")
            val json = JSONObject(body)
            val url = json.optString("url", "").trim()
            val enabled = json.optBoolean("enabled", true)
            prefs.edit()
                .putString("dev_proxy_url", url)
                .putBoolean("dev_proxy_enabled", enabled)
                .apply()
            newJsonResponse(Response.Status.OK, JSONObject().put("ok", true))
        } catch (e: Exception) {
            badRequest("Invalid JSON")
        }
    }

    private val indexHtml = """
        <!doctype html>
        <html lang="en">
        <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>WOL Relay</title>
            <style>
                body { font-family: system-ui, sans-serif; margin: 2rem; }
                form { display: grid; gap: 0.75rem; max-width: 480px; }
                label { font-weight: 600; }
                input, button { padding: 0.6rem 0.8rem; font-size: 1rem; }
                .row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
                .note { color: #666; font-size: 0.9rem; }
                .card { border: 1px solid #ddd; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
                table { border-collapse: collapse; width: 100%; }
                th, td { text-align: left; padding: 0.4rem; border-bottom: 1px solid #eee; }
                .actions button { margin-right: .4rem }
                .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
                .dot-online { background: #22c55e; }
                .dot-offline { background: #ef4444; }
                .dot-unknown { background: #ccc; }
            </style>
        </head>
        <body>
            <h1>Wake On LAN</h1>

            <div class="card">
              <h3>Auth</h3>
              <div>
                <label>Shared Token</label><br />
                <input id="tokenInput" placeholder="Enter token if configured" />
                <button type="button" onclick="saveToken()">Save Token</button>
                <div class="note">Token is stored locally in this browser and added to requests.</div>
              </div>
            </div>

            <div class="card">
              <h3>Devices</h3>
              <table id="devicetable">
                <thead><tr><th>Name</th><th>MAC</th><th>IP</th><th>Port</th><th>Status</th><th class="actions">Actions</th></tr></thead>
                <tbody id="devices"></tbody>
              </table>
            </div>

            <div class="card">
              <h3>Add / Update Device</h3>
              <form onsubmit="return saveDevice(event)">
                  <input type="hidden" name="id" />
                  <div>
                      <label>Name</label><br />
                      <input name="name" placeholder="My PC" required />
                  </div>
                  <div>
                      <label>MAC Address</label><br />
                      <input name="mac" placeholder="AA:BB:CC:DD:EE:FF" required />
                  </div>
                  <div>
                      <label>Device IP (Status Check)</label><br />
                      <input name="pingIp" placeholder="192.168.1.100" />
                      <div class="note">The specific IP of your PC. Used to check if it's Online/Offline.</div>
                  </div>
                  <div class="row">
                      <div>
                          <label>Broadcast IP</label><br />
                          <input name="ip" value="255.255.255.255" />
                          <div class="note">Usually 255.255.255.255. Sends the wake signal to the network.</div>
                      </div>
                      <div>
                          <label>Port</label><br />
                          <input name="port" type="number" value="9" />
                          <div class="note">Default is 9.</div>
                      </div>
                  </div>
                  <div class="row">
                      <button type="submit">Save</button>
                      <button type="button" onclick="resetForm()">Reset</button>
                  </div>
                  <div id="formResult" class="note"></div>
              </form>
            </div>

            <div class="note">Tip: use your LAN broadcast (e.g. 192.168.1.255) if routers drop 255.255.255.255.</div>

            <script>
              let token = '';
              function loadToken() {
                try { token = localStorage.getItem('token') || ''; } catch (e) { token = ''; }
                const el = document.getElementById('tokenInput'); if (el) el.value = token;
              }
              function saveToken() {
                const el = document.getElementById('tokenInput');
                token = (el && el.value ? el.value : '').trim();
                try { localStorage.setItem('token', token); } catch (e) {}
                refreshDevices();
              }
              async function api(path, opts={}) {
                opts.headers = opts.headers || {};
                if (token) opts.headers['X-Auth-Token'] = token;
                const res = await fetch(path, opts);
                if (!res.ok) throw new Error(await res.text());
                const ct = res.headers.get('content-type')||'';
                return ct.includes('application/json') ? res.json() : res.text();
              }

              async function refreshDevices() {
                const tbody = document.getElementById('devices');
                tbody.innerHTML = '<tr><td colspan="6">Loading…</td></tr>';
                try {
                  const list = await api('/api/devices');
                  tbody.innerHTML = '';
                  if (!Array.isArray(list) || list.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6">No devices yet</td></tr>';
                    return;
                  }
                  // Collect pingIps for status check
                  const pingIps = list.map(d => d.pingIp).filter(Boolean);
                  let statuses = {};
                  if (pingIps.length > 0) {
                    try {
                      const pingRes = await api('/api/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ips: pingIps }) });
                      statuses = pingRes.results || {};
                    } catch (_) {}
                  }
                  for (const d of list) {
                    const tr = document.createElement('tr');
                    const statusDot = d.pingIp ? (statuses[d.pingIp] ? '<span class="dot dot-online"></span>Online' : '<span class="dot dot-offline"></span>Offline') : '<span class="dot dot-unknown"></span>—';
                    tr.innerHTML = `<td>${'$'}{d.name||''}</td><td>${'$'}{d.mac||''}</td><td>${'$'}{d.ip||''}</td><td>${'$'}{d.port||9}</td><td>${'$'}{statusDot}</td>`;
                    const tdActions = document.createElement('td');
                    tdActions.className='actions';
                    const wakeBtn = document.createElement('button');
                    wakeBtn.textContent = 'Wake';
                    wakeBtn.onclick = () => sendWolManual(d.mac, d.ip, d.port);
                    const editBtn = document.createElement('button');
                    editBtn.textContent = 'Edit';
                    editBtn.onclick = () => fillForm(d);
                    const delBtn = document.createElement('button');
                    delBtn.textContent = 'Delete';
                    delBtn.onclick = async () => { if (confirm('Delete device?')) { await api('/api/devices/'+d.id, { method: 'DELETE' }); refreshDevices(); } };
                    tdActions.appendChild(wakeBtn); tdActions.appendChild(editBtn); tdActions.appendChild(delBtn);
                    tr.appendChild(tdActions);
                    tbody.appendChild(tr);
                  }
                } catch (err) {
                  tbody.innerHTML = `<tr><td colspan="6">Error: ${'$'}{err.message}</td></tr>`;
                }
              }

              function fillForm(d) {
                const f = document.forms[0];
                f.id.value = d.id||'';
                f.name.value = d.name||'';
                f.mac.value = d.mac||'';
                f.ip.value = d.ip||'255.255.255.255';
                f.port.value = d.port||9;
                f.pingIp.value = d.pingIp||'';
              }

              function resetForm() {
                const f = document.forms[0];
                f.id.value = '';
                f.name.value=''; f.mac.value=''; f.ip.value='255.255.255.255'; f.port.value=9; f.pingIp.value='';
                document.getElementById('formResult').textContent='';
              }

              async function saveDevice(e) {
                e.preventDefault();
                const f = e.target;
                const payload = { id: f.id.value, name: f.name.value, mac: f.mac.value, ip: f.ip.value, port: Number(f.port.value)||9, pingIp: (f.pingIp.value||'').trim() };
                try {
                  await api('/api/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                  document.getElementById('formResult').textContent = 'Saved';
                  refreshDevices();
                } catch (err) {
                  document.getElementById('formResult').textContent = 'Error: '+err.message;
                }
                return false;
              }

              async function sendWolManual(mac, ip, port) {
                const data = new URLSearchParams();
                data.set('mac', mac); if (ip) data.set('ip', ip); if (port) data.set('port', port);
                const opts = { method: 'POST', body: data, headers: {} };
                if (token) opts.headers['X-Auth-Token'] = token;
                const res = await fetch('/wol', opts);
                const text = await res.text();
                alert(res.ok ? text : ('Error: '+text));
              }

              async function sendWol(e) {
                e.preventDefault();
                const form = e.target;
                const result = document.getElementById('formResult');
                result.textContent = 'Sending…';
                const data = new URLSearchParams(new FormData(form));
                try {
                  const res = await fetch('/wol', { method: 'POST', body: data });
                  const text = await res.text();
                  result.textContent = res.ok ? text : ('Error: ' + text);
                } catch (err) {
                  result.textContent = 'Network error: ' + err;
                }
                return false;
              }

              loadToken();
              refreshDevices();
            </script>
        </body>
        </html>
    """.trimIndent()
}

private inline fun String?.ifNullOrBlank(defaultValue: () -> String): String {
    return if (this == null || this.isBlank()) defaultValue() else this
}
