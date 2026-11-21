#!/usr/bin/env bash
# Brute-force the WebSocket upgrade against foxglove_bridge to find the accepted
# subprotocol / header expectations. Prints the raw status for each candidate.
set -o pipefail
PORT="${1:-8765}"

probe() {
  local label="$1"; shift
  local extra="$1"
  python3 - "$PORT" "$label" "$extra" <<'PY'
import socket, sys
port, label, extra = int(sys.argv[1]), sys.argv[2], sys.argv[3]
req = (
    "GET / HTTP/1.1\r\n"
    "Host: 127.0.0.1:%d\r\n"
    "Upgrade: websocket\r\n"
    "Connection: Upgrade\r\n"
    "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
    "Sec-WebSocket-Version: 13\r\n"
    "%s"
    "\r\n"
) % (port, extra)
try:
    s = socket.create_connection(("127.0.0.1", port), timeout=5)
    s.sendall(req.encode())
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = s.recv(4096)
        if not chunk:
            break
        data += chunk
    head = data.split(b"\r\n\r\n")[0].decode("utf-8", "replace")
    lines = head.split("\r\n")
    print(f"--- {label}")
    print("   ", lines[0])
    for ln in lines[1:]:
        if ln.lower().startswith(("sec-websocket-protocol", "content-type", "sec-websocket-accept")):
            print("   ", ln)
    if len(lines) > 1 and len(head.split("\r\n\r\n")) > 1:
        body = data.split(b"\r\n\r\n", 1)[1].strip()
        if body:
            print("    body:", body[:200].decode("utf-8", "replace"))
    s.close()
except Exception as e:
    print(f"--- {label}: ERROR {e}")
PY
}

probe "v1"            $'Sec-WebSocket-Protocol: foxglove.websocket.v1\r\n'
probe "v2"            $'Sec-WebSocket-Protocol: foxglove.websocket.v2\r\n'
probe "v1+v2"         $'Sec-WebSocket-Protocol: foxglove.websocket.v1, foxglove.websocket.v2\r\n'
probe "v2+v1"         $'Sec-WebSocket-Protocol: foxglove.websocket.v2, foxglove.websocket.v1\r\n'
probe "v1-only-lower" $'sec-websocket-protocol: foxglove.websocket.v1\r\n'
probe "v3"            $'Sec-WebSocket-Protocol: foxglove.websocket.v3\r\n'
probe "json"          $'Sec-WebSocket-Protocol: foxglove.websocket\r\n'
probe "none"          ''
