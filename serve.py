#!/usr/bin/env python3
# ПАЛАТА №6 — локальный статический сервер с отключённым кэшем.
# Зачем no-cache: на киоске (Safari) после обновления файлов следующий гость
# должен гарантированно получить свежую версию, а не страницу из кэша.
# Обслуживает текущую рабочую директорию (в LaunchAgent задаётся WorkingDirectory).
#
# Использование: python3 serve.py [порт]   (по умолчанию 6006, биндится на 0.0.0.0)
import sys
import http.server
import socketserver

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 6006


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('0.0.0.0', PORT), NoCacheHandler) as httpd:
    print('ПАЛАТА №6 serve.py на 0.0.0.0:%d (no-cache)' % PORT)
    httpd.serve_forever()
