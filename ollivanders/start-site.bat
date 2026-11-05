@echo off
rem Double-click to run the website at http://localhost:3000  (close this window to stop it)
cd /d "%~dp0"
title Wand Atelier server
start "" http://localhost:3000
node server.js
pause
