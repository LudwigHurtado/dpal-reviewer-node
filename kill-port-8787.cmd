@echo off
REM Stops the process listening on port 8787 (stale reviewer API). Run from cmd or PowerShell: .\kill-port-8787.cmd
setlocal
set PORT=8787
echo Looking for LISTENING process on port %PORT% ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr LISTENING') do (
  echo Stopping PID %%a
  taskkill /F /PID %%a
)
echo Done. If nothing was listed, the port was already free.
