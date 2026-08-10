@echo off
cd /d "%~dp0"
node cli.js
if errorlevel 1 pause
