@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   CAI DAT LAN DAU
echo ============================================
echo.

if not exist "backend\.env.example" (
  echo [LOI] Thieu file backend\.env.example
  pause
  exit /b 1
)

call :EnsureBackendEnv
call :EnsureFrontendEnv

if not exist "backend-data" (
  mkdir "backend-data"
  echo [OK] Da tao thu muc backend-data.
)

call :CheckBackendEnv
if "%CONFIG_OK%"=="1" (
  echo.
  echo ============================================
  echo   DA XONG
  echo ============================================
  echo Bay gio chay: CHAY_UNG_DUNG.bat
  timeout /t 4 /nobreak >nul
  exit /b 0
)

echo.
echo [LOI] backend\.env.example chua co Google Client ID/Secret.
echo Nguoi quan ly can dien vao backend\.env.example truoc khi gui team.
pause
exit /b 1

:EnsureBackendEnv
set "CONFIG_OK=0"
if not exist "backend\.env" goto CopyBackendEnv
call :CheckBackendEnv
if "%CONFIG_OK%"=="0" goto CopyBackendEnv
echo [--] backend\.env da du thong tin.
goto :eof

:CopyBackendEnv
copy /Y "backend\.env.example" "backend\.env" >nul
echo [OK] Da tao/ghi de backend\.env tu .env.example
call :CheckBackendEnv
goto :eof

:EnsureFrontendEnv
if exist "frontend\.env" (
  echo [--] frontend\.env da ton tai.
  goto :eof
)
if exist "frontend\.env.example" (
  copy "frontend\.env.example" "frontend\.env" >nul
  echo [OK] Da tao frontend\.env tu .env.example
) else (
  echo NEXT_PUBLIC_API_URL=http://localhost:5000> "frontend\.env"
  echo [OK] Da tao frontend\.env mac dinh.
)
goto :eof

:CheckBackendEnv
set "CONFIG_OK=1"
if not exist "backend\.env" set "CONFIG_OK=0" & goto :eof
findstr /I /C:"GOOGLE_CLIENT_ID=your_google" "backend\.env" >nul 2>&1 && set "CONFIG_OK=0"
findstr /I /C:"GOOGLE_CLIENT_SECRET=your_google" "backend\.env" >nul 2>&1 && set "CONFIG_OK=0"
findstr /I /C:"GOOGLE_CLIENT_ID=" "backend\.env" >nul 2>&1 || set "CONFIG_OK=0"
findstr /I /C:"GOOGLE_CLIENT_SECRET=" "backend\.env" >nul 2>&1 || set "CONFIG_OK=0"
goto :eof
