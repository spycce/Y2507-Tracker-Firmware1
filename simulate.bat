@echo off
title AeroTrack Virtual Tracker Simulator
color 0a

echo ========================================================
echo       AEROTRACK // VIRTUAL TRACKER SIMULATOR            
echo   Sends Live GT06 GPS, ACC, and Battery Packets to :5023
echo ========================================================
echo.

node scratch/simulate_tracker.js

pause

