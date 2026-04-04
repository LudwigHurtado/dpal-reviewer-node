@echo off
REM Use this if PowerShell blocks npm.ps1 (execution policy). Double-click or run from cmd.exe.
cd /d "%~dp0"
call npm.cmd run dev:all
if errorlevel 1 pause
