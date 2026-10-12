"""Servidor de desarrollo: sirve la carpeta del juego sin caché.

Uso:
    python tools/serve.py [puerto]     (por defecto 8123)

Igual que `python -m http.server`, pero con `Cache-Control: no-store` para
que el navegador recargue siempre los scripts recién editados.
"""
import functools
import http.server
import socket
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class DualStack(http.server.ThreadingHTTPServer):
    """Escucha por IPv4 y por IPv6 a la vez.

    "localhost" puede resolverse como 127.0.0.1 o como ::1; si sólo se escucha
    por IPv4, quien entre por ::1 (por ejemplo ngrok apuntando a localhost)
    recibe errores al azar.
    """

    address_family = socket.AF_INET6
    # la cola por defecto es de 5 conexiones: ngrok (o un navegador) pide
    # los ~25 scripts a la vez y Windows rechaza las que no entran
    request_queue_size = 128
    daemon_threads = True

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    handler = functools.partial(NoCache, directory=str(ROOT))
    print(f"PokéFútbol en http://localhost:{port}")
    DualStack(("::", port), handler).serve_forever()
