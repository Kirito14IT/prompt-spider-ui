@echo off
cd /d "%~dp0"
echo Open http://127.0.0.1:4317 after the server starts.
node server.mjs
pause
