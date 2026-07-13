@echo off
cd /d "%~dp0"
where chrome >nul 2>&1
if errorlevel 1 (
  start http://localhost:3001
) else (
  start chrome http://localhost:3001
)
