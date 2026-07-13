@echo off
cd /d "%~dp0"
where chrome >nul 2>&1
if errorlevel 1 (
  start "" "%~dp0HUONG_DAN.html"
) else (
  start chrome "%~dp0HUONG_DAN.html"
)
