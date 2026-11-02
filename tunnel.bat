@echo off
title AeroTrack // Internet Public Access Gateway
color 0b

set "BORE_EXE=%~dp0bin\bore.exe"
if not exist "%BORE_EXE%" set "BORE_EXE=%~dp0scratch\bore.exe"

set "CF_EXE=C:\Program Files (x86)\cloudflared\cloudflared.exe"
if not exist "%CF_EXE%" (
    where cloudflared >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set "CF_EXE=cloudflared"
    ) else (
        set "CF_EXE="
    )
)

:MENU
cls
echo ========================================================
echo       AEROTRACK // INTERNET CLOUD ACCESS GATEWAY        
echo   Free Worldwide Access for Dashboard & GPS Tracker    
echo ========================================================
echo.
echo Select an option:
echo.
echo   [1] Full Internet Tracking Mode (RECOMMENDED)
echo       - Starts Bore Persistent TCP Tunnel on Port 5023
echo       - Starts Cloudflare HTTPS Web Dashboard Tunnel
echo       - Point Tracker ONCE: SERVER,1,bore.pub,5023,0#
echo.
echo   [2] Start Tracker TCP Ingestion Tunnel ONLY (Bore Fixed Port 5023)
echo       - Host: bore.pub   Port: 5023 (Never changes!)
echo       - SMS Command: SERVER,1,bore.pub,5023,0#
echo.
echo   [3] Start Web Dashboard Public HTTPS Tunnel ONLY (Cloudflare)
echo       - Generates free https://*.trycloudflare.com link
echo       - View live map on phone or remote computer
echo.
echo   [4] Fallback: Pinggy TCP via SSH (Random Port)
echo.
echo   [5] Tracker Troubleshooting & SMS Commands Guide
echo.
echo   [0] Exit
echo.
set /p opt="Enter choice [0-5]: "

if "%opt%"=="1" goto BOTH_TUNNELS
if "%opt%"=="2" goto BORE_TUNNEL
if "%opt%"=="3" goto WEB_TUNNEL
if "%opt%"=="4" goto PINGGY_TUNNEL
if "%opt%"=="5" goto DIAG_GUIDE
if "%opt%"=="0" exit /b 0

echo Invalid selection.
timeout /t 1 >nul
goto MENU

:BOTH_TUNNELS
echo.
echo ========================================================
echo     Starting Full Internet Tracking Mode (TCP + Web)
echo ========================================================
echo.
echo [1/2] Spawning Bore Persistent TCP Ingestion Tunnel (Port 5023)...
start "AeroTrack - Bore TCP Tunnel (Port 5023)" cmd /k ""%BORE_EXE%" local 5023 --to bore.pub -p 5023"
timeout /t 2 /nobreak >nul

if defined CF_EXE (
    echo [2/2] Spawning Cloudflare Web Dashboard Tunnel (Port 8080)...
    start "AeroTrack - Web Dashboard Cloudflare Tunnel" cmd /k ""%CF_EXE%" tunnel --url http://localhost:8080"
) else (
    echo [WARNING] Cloudflare executable not found. Only TCP tunnel was spawned.
    echo Install cloudflared if you want a public web link.
)

echo.
echo ========================================================
echo   [READY] Both gateways are operational!
echo   * Tracker TCP Address:  bore.pub:5023
echo   * Send SMS to Tracker:  SERVER,1,bore.pub,5023,0#
echo   * Dashboard URL:        Check the Cloudflare window!
echo ========================================================
echo.
pause
goto MENU

:BORE_TUNNEL
echo.
echo ========================================================
echo    Starting Bore Persistent TCP Tunnel (Port 5023)     
echo ========================================================
echo [INFO] Exposing local port 5023 to bore.pub:5023...
echo [INFO] Tracker SMS: SERVER,1,bore.pub,5023,0#
echo.
"%BORE_EXE%" local 5023 --to bore.pub -p 5023
pause
goto MENU

:WEB_TUNNEL
if not defined CF_EXE (
    echo [ERROR] Cloudflare tunnel executable not found!
    pause
    goto MENU
)
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

:PINGGY_TUNNEL
echo.
echo ========================================================
echo    Starting Fallback TCP Tunnel via Pinggy (Port 5023)
echo ========================================================
echo [INFO] Look for the assigned tcp.pinggy.io:PORT below:
echo [WARNING] This port changes every time Pinggy restarts!
echo.
ssh -p 443 -R0:localhost:5023 -o StrictHostKeyChecking=no -o ServerAliveInterval=30 tcp@a.pinggy.io
pause
goto MENU

:DIAG_GUIDE
cls
echo ========================================================
echo       Y2507 HARDWARE TRACKER // SMS QUICK REFERENCE     
echo ========================================================
echo.
echo 1. CONFIGURE SERVER (Run Bore Tunnel First):
echo    Send SMS: SERVER,1,bore.pub,5023,0#
echo.
echo 2. SET CELLULAR APN (Required for GPRS Data):
echo    Airtel:   APN,airtelgprs.com#
echo    Vi (Vod): APN,www#
echo    BSNL:     APN,bsnlnet#
echo    * Note: Jio SIM cards DO NOT WORK (Jio has no 2G network).
echo.
echo 3. CHECK TRACKER HEALTH VIA SMS:
echo    Send SMS: PARAM#     (Returns IMEI, Server IP/Port, and APN)
echo    Send SMS: STATUS#    (Returns GPS Fix, GSM CSQ, Battery %%)
echo    Send SMS: WHERE#     (Returns immediate GPS fix link)
echo.
echo 4. PREVENT SLEEP MODE WHEN OUTSIDE:
echo    - Connect Orange wire (ACC) to Red wire (+12V Power).
echo    - Or send SMS: TIMER,10# (forces 10-second reporting).
echo.
echo 5. COMPUTER POWER:
echo    - Ensure this computer does not go to sleep when walking outside!
echo.
pause
goto MENU
