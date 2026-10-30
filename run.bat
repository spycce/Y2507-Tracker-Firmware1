@echo off
title AeroTrack Telematics Platform - Y2507 GT06
color 0b

echo ========================================================
echo       AEROTRACK // Y2507-GT06 TELEMATICS PLATFORM       
echo    Real-time Ingestion, SQLite Storage & Live Map UI    
echo ========================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

if not exist node_modules (
    echo [SETUP] Installing required dependencies...
    call npm install
)

echo [STARTING] Launching Telematics Ingestion and Web Dashboard...
echo [INFO] Ingestion TCP: 0.0.0.0:5023
echo [INFO] Dashboard Web: http://localhost:8080
echo.

timeout /t 2 /nobreak >nul
start "" http://localhost:8080
node server/index.js

pause
