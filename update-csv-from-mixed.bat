@echo off
setlocal
cd /d "%~dp0"

echo [icon-composer] 开始更新本地 CSV ...
node "scripts\update-csv-from-mixed.js"
set ERR=%ERRORLEVEL%

if not "%ERR%"=="0" (
  echo.
  echo [icon-composer] 更新失败，退出码 %ERR%
  pause
  exit /b %ERR%
)

echo.
echo [icon-composer] 更新完成。
pause
exit /b 0

