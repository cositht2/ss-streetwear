@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
echo ========================================
echo      S&S STREETWEAR - SERVIDOR
echo ========================================
echo.
where python >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python no esta instalado o no esta en PATH.
  pause
  exit /b 1
)
python app.py
if errorlevel 1 (
  echo.
  echo El servidor termino con un error.
)
pause
