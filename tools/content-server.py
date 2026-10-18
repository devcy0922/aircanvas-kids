#!/usr/bin/env python3
"""AirCanvas Kids 개발용 콘텐츠 서버.

기본 ``http.server``는 다른 포트의 폰 앱에서 manifest를 fetch할 때 CORS
헤더를 보내지 않는다. 이 얇은 개발 서버는 Nginx 설정과 같은 CORS 계약을
제공하며, 운영 콘텐츠 서버를 대체하지 않는다.
"""

from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class ContentRequestHandler(SimpleHTTPRequestHandler):
    server_version = "AirCanvasContent/0.2"

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description="AirCanvas Kids CORS 콘텐츠 서버")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8081)
    parser.add_argument("--directory", default="content-server")
    args = parser.parse_args()

    handler = partial(ContentRequestHandler, directory=args.directory)
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"AirCanvas content server listening on {args.host}:{args.port} ({args.directory})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
