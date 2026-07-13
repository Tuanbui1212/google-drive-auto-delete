@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   CAI DAT LAN DAU
echo ============================================
echo.

if not exist "backend\.env" (
  copy "backend\.env.example" "backend\.env" >nul
  echo [OK] Da tao backend\.env tu file mau.
) else (
  echo [--] backend\.env da ton tai, giu nguyen.
)

if not exist "frontend\.env" (
  copy "frontend\.env.example" "frontend\.env" >nul
  echo [OK] Da tao frontend\.env tu file mau.
) else (
  echo [--] frontend\.env da ton tai, giu nguyen.
)

if not exist "backend-data" (
  mkdir "backend-data"
  echo [OK] Da tao thu muc backend-data.
)

echo.
echo ============================================
echo   BUOC QUAN TRONG (nguoi setup 1 lan)
echo ============================================
echo.
echo Mo file: backend\.env
echo Dien vao:
echo   GOOGLE_CLIENT_ID=...
echo   GOOGLE_CLIENT_SECRET=...
echo.
echo Lay tu Google Cloud Console (OAuth 2.0 Client).
echo Sau do chay CHAY_UNG_DUNG.bat
echo.
pause
