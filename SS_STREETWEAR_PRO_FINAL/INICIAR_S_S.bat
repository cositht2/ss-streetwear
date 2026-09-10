@echo off
setlocal
cd /d "%~dp0backend"
start "S&S STREETWEAR - SERVIDOR" cmd /k "python app.py"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:5000/user/"
