@echo off
setlocal
cd /d "%~dp0.."
chcp 65001 >nul
title S&S STREETWEAR - SERVIDOR

echo ==========================================
echo       S&S STREETWEAR - SERVIDOR
echo ==========================================
echo.

where py >nul 2>nul
if errorlevel 1 (
    where python >nul 2>nul
    if errorlevel 1 (
        echo ERROR: Python no esta instalado o no esta en PATH.
        echo Instala Python 3.11 o superior y vuelve a intentarlo.
        pause
        exit /b 1
    )
    set "PYTHON=python"
) else (
    set "PYTHON=py"
)

if not exist ".venv\Scripts\python.exe" (
    echo Creando entorno virtual...
    %PYTHON% -m venv .venv
    if errorlevel 1 (
        echo ERROR: No se pudo crear el entorno virtual.
        pause
        exit /b 1
    )
)

echo Comprobando dependencias...
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo ERROR: No se pudieron instalar las dependencias.
    echo Revisa tu conexion a Internet.
    pause
    exit /b 1
)

echo.
echo Servidor iniciado en:
echo http://127.0.0.1:5000/
echo.
".venv\Scripts\python.exe" backend\app.py

echo.
echo El servidor se cerro.
pause
