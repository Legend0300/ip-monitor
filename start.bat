@echo off
title IP Monitor
echo ============================================
echo   IP Monitor - Starting up...
echo ============================================
echo.

:: Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found in PATH.
    echo Install Python 3.10+ from https://python.org
    pause
    exit /b 1
)

:: Check Node
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found in PATH.
    echo Install Node.js from https://nodejs.org
    pause
    exit /b 1
)

:: Install Python dependencies
echo [1/3] Installing Python dependencies...
cd /d "%~dp0backend"
pip install -r requirements.txt -q
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Python dependencies.
    pause
    exit /b 1
)

:: Install Electron dependencies
echo [2/3] Installing Electron dependencies...
cd /d "%~dp0frontend"
if not exist node_modules (
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install npm dependencies.
        pause
        exit /b 1
    )
)

:: Launch
echo [3/3] Launching IP Monitor...
echo.
echo NOTE: Packet capture requires Administrator privileges.
echo       Run this script as Administrator for full functionality.
echo.
call npm start
