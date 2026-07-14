@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   GOOGLE PHOTOS TOOL - KHOI DONG
echo ============================================
echo.

where docker >nul 2>&1
if errorlevel 1 (
  echo [LOI] Chua cai Docker Desktop.
  echo Tai tai: https://www.docker.com/products/docker-desktop/
  echo.
  pause
  exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
  echo [LOI] Docker Desktop chua chay.
  echo Hay mo ung dung Docker Desktop, doi bong xanh roi chay lai file nay.
  echo.
  pause
  exit /b 1
)

if not exist "backend\.env" (
  echo Chua co file cau hinh. Dang chay cai dat lan dau...
  call "%~dp0CAI_DAT_LAN_DAU.bat"
)

if not exist "frontend\.env" (
  copy "frontend\.env.example" "frontend\.env" >nul
)

if not exist "backend-data" mkdir "backend-data"

echo Dang build va khoi dong Docker...
echo Lan dau co the mat 5-15 phut, vui long cho.
echo.

docker compose up --build -d
if errorlevel 1 (
  echo.
  echo [LOI] Khong khoi dong duoc.
  echo Kiem tra:
  echo   1. backend\.env da dien GOOGLE_CLIENT_ID va GOOGLE_CLIENT_SECRET
  echo   2. Docker Desktop dang chay
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   DA CHAY THANH CONG
echo ============================================
echo   Web:     http://localhost:3001
echo   Backend: http://localhost:5000
echo.
echo Mo Chrome sau 5 giay...
timeout /t 5 /nobreak >nul
call "%~dp0_mo_chrome.bat" "http://localhost:3001"
echo.
echo De tat ung dung: double-click TAT_UNG_DUNG.bat
echo.
pause
