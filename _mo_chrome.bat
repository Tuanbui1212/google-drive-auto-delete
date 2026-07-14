@echo off
set "URL=%~1"
if "%URL%"=="" exit /b 1

set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
)
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
)
if not defined CHROME if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
  set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
)

if defined CHROME (
  start "" "%CHROME%" "%URL%"
  exit /b 0
)

echo [LOI] Khong tim thay Google Chrome.
echo Cai Chrome: https://www.google.com/chrome/
echo Khong dung Firefox / Coc Coc.
pause
exit /b 1
