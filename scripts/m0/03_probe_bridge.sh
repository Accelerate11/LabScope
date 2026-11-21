#!/usr/bin/env bash
# Inspect the installed foxglove_bridge binary and test it from inside Linux.
set -o pipefail
source /opt/ros/humble/setup.bash
BIN=/opt/ros/humble/lib/foxglove_bridge/foxglove_bridge

echo "=== binary ==="
ls -la "$BIN"
echo "=== subprotocol strings ==="
strings -a "$BIN" | grep -iE 'foxglove\.websocket[.a-zA-Z0-9]*' | sort -u | head -20
echo "=== handshake strings ==="
strings -a "$BIN" | grep -iE 'handshake failed|sec-websocket-protocol|subprotocol' | sort -u | head -20
echo "=== python ws libs ==="
python3 - <<'PY'
try:
    import websockets
    print("websockets", websockets.__version__)
except Exception as e:
    print("websockets MISSING:", e)
try:
    import websocket  # websocket-client
    print("websocket-client", websocket.__version__)
except Exception as e:
    print("websocket-client MISSING:", e)
PY
echo "=== raw HTTP upgrade request (nc) ==="
which nc ncat socat curl | head -4
printf 'GET / HTTP/1.1\r\nHost: 127.0.0.1:8765\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: foxglove.websocket.v1\r\n\r\n' > /tmp/labscope_m0/upgrade.req
timeout 5 python3 - <<'PY'
import socket
req = open('/tmp/labscope_m0/upgrade.req','rb').read()
s = socket.create_connection(('127.0.0.1', 8765), timeout=5)
s.sendall(req)
data = b''
try:
    while len(data) < 4096:
        chunk = s.recv(1024)
        if not chunk: break
        data += chunk
        if b'\r\n\r\n' in data: break
except Exception as e:
    print("recv error:", e)
print("RESPONSE:")
print(data.decode('utf-8', 'replace'))
s.close()
PY
