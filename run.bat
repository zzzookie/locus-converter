@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не найден.
  echo Установите Node.js с https://nodejs.org и повторите запуск.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Установка зависимостей...
  call npm install
)

echo Сборка проекта...
call npm run build
if errorlevel 1 (
  echo Ошибка сборки. Проверьте вывод выше.
  pause
  exit /b 1
)

echo.
echo  Locus Converter — JSON в GPX/KML для Locus Map
echo  http://localhost:8123
echo  Папка ввода:  data\input
echo  Папка вывода: data\output
echo.
node build/server.js --open
pause

