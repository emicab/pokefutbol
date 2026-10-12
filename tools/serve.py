"""Servidor de desarrollo: sirve la carpeta del juego sin caché.

Uso:
    python tools/serve.py [puerto]     (por defecto 8123)

Igual que `python -m http.server`, pero con `Cache-Control: no-store` para
que el navegador recargue siempre los scripts recién editados.
"""
import functools
import http.server
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    handler = functools.partial(NoCache, directory=str(ROOT))
    print(f"PokéFútbol en http://localhost:{port}")
    http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
