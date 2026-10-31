@echo off
title AeroTrack // Internet Public Access Gateway
color 0b

echo ========================================================
echo       AEROTRACK // INTERNET CLOUD ACCESS GATEWAY        
echo   Free Worldwide Access for Dashboard & GPS Tracker    
echo ========================================================
echo.

set "CF_EXE=C:\Program Files (x86)\cloudflared\cloudflared.exe"
if not exist "%CF_EXE%" (
    where cloudflared >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set "CF_EXE=cloudflared"
    ) else (
        echo [ERROR] Cloudflare tunnel executable not found!
        pause
        exit /b 1
    )
)

:MENU
echo Select an option:
echo.
echo   [1] Start Web Dashboard Public HTTPS Tunnel (Cloudflare)
echo       - Generates a free, secure https://*.trycloudflare.com link
echo       - Access your live map dashboard from any phone or computer
echo.
echo   [2] Start Tracker TCP Ingestion Tunnel (Pinggy TCP via SSH)
echo       - Bypasses router / CGNAT to expose TCP port 5023
echo       - Point your GPS hardware tracker to the given public host & port
echo.
echo   [3] Launch BOTH (Full Internet Tracking Mode)
echo.
echo   [4] Try Router UPnP Automatic Port Forward (Direct Home Router)
echo.
echo   [0] Exit
echo.
set /p opt="Enter choice [1-4]: "

if "%opt%"=="1" goto WEB_TUNNEL
if "%opt%"=="2" goto TCP_TUNNEL
if "%opt%"=="3" goto BOTH_TUNNELS
if "%opt%"=="4" goto UPNP_MAP
if "%opt%"=="0" exit /b 0

echo Invalid selection.
goto MENU

:WEB_TUNNEL
echo.
echo ========================================================
echo   Starting Cloudflare Secure HTTPS Tunnel (Port 8080)   
echo ========================================================
echo [INFO] Look for the 'https://*.trycloudflare.com' URL below:
echo [INFO] Share that link to access your dashboard from anywhere!
echo.
"%CF_EXE%" tunnel --url http://localhost:8080
pause
goto MENU

:TCP_TUNNEL
echo.
echo ========================================================
echo    Starting Public TCP Ingestion Tunnel (Port 5023)     
echo ========================================================
echo [INFO] Creating encrypted TCP tunnel via built-in Windows OpenSSH...
echo [INFO] Point your Y2507 tracker's IP/DNS and Port to the assigned address!
echo.
ssh -p 443 -R0:localhost:5023 -o StrictHostKeyChecking=no -o ServerAliveInterval=30 tcp@a.pinggy.io
pause
goto MENU

:BOTH_TUNNELS
echo.
echo [LAUNCHING] Spawning Web Dashboard Tunnel in new window...
start "AeroTrack - Web Dashboard Cloudflare Tunnel" cmd /k ""%CF_EXE%" tunnel --url http://localhost:8080"
timeout /t 2 /nobreak >nul
echo [LAUNCHING] Spawning Tracker TCP Ingestion Tunnel in new window...
start "AeroTrack - Tracker TCP Ingestion Tunnel" cmd /k "ssh -p 443 -R0:localhost:5023 -o StrictHostKeyChecking=no -o ServerAliveInterval=30 tcp@a.pinggy.io"
echo.
echo [READY] Both tunnels are running in separate windows!
echo Check those windows for your public Web URL and Tracker TCP IP:Port.
pause
goto MENU

:UPNP_MAP
echo.
echo [UPNP] Attempting automatic router port mapping for port 5023...
powershell -ExecutionPolicy Bypass -File "%~dp0scratch\upnp.ps1"
echo.
pause
goto MENU
