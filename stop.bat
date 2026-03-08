@echo off
echo Stopping IP Monitor...

:: Kill Python backend (uvicorn on port 8420)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8420" ^| findstr "LISTENING"') do (
    echo Killing backend process PID %%a
    taskkill /PID %%a /F >nul 2>&1
)

:: Kill Electron processes
taskkill /IM electron.exe /F >nul 2>&1

echo IP Monitor stopped.
