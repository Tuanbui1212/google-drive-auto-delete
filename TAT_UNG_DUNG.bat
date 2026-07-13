@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Dang tat ung dung...
docker compose down

if errorlevel 1 (
  echo [LOI] Khong tat duoc. Kiem tra Docker Desktop dang chay.
) else (
  echo Da tat ung dung.
)

echo.
pause
