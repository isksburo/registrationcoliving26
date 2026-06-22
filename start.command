#!/bin/bash
# ПАЛАТА №6 — запуск киоска на Mac Mini.
# Двойной клик в Finder ИЛИ ./start.command в терминале.
set -euo pipefail

PORT=6006
URL="http://127.0.0.1:${PORT}/index.html"

# Папка скрипта (работает и при двойном клике из Finder).
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Нужен python3. Установи Xcode Command Line Tools: xcode-select --install"
  exit 1
fi

# SECURITY: если порт уже занят ЧУЖИМ процессом — не запускаем киоск поверх него
# (иначе Chrome в режиме --app показал бы контент постороннего сервиса на этом порту).
if curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
  echo "Порт ${PORT} уже кем-то занят. Закрой посторонний сервис и запусти снова."
  exit 1
fi

# Поднимаем локальный сервер ТОЛЬКО на localhost (наружу не торчит).
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!

# Глушим сервер при выходе/закрытии окна.
# SECURITY FIX: убиваем именно нашу группу/процесс и только если он ещё жив.
cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

# Ждём, пока сервер реально поднимется.
SERVER_UP=0
for _ in $(seq 1 20); do
  # SECURITY FIX: если фоновый python успел упасть (занятый порт, нет прав и т.п.) —
  # прекращаем, чтобы НЕ открыть киоск поверх неизвестно чего.
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "Локальный сервер не поднялся (процесс python завершился). Проверь порт ${PORT}."
    exit 1
  fi
  if curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then SERVER_UP=1; break; fi
  sleep 0.2
done

if [ "$SERVER_UP" -ne 1 ]; then
  echo "Сервер не ответил вовремя. Киоск не открываю."
  exit 1
fi

echo "ПАЛАТА №6 открыта: ${URL}"
echo "Закрой окно Chrome и нажми Ctrl+C здесь, чтобы остановить."

# Chrome в режиме киоска (без адресной строки, на весь экран).
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --kiosk --app="$URL" --disable-pinch --overscroll-history-navigation=0
else
  echo "Chrome не найден — открываю в системном браузере (без киоска)."
  open "$URL"
fi

# Держим сервер живым, пока не нажмут Ctrl+C.
wait "$SERVER_PID"
