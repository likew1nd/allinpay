@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
title Epay Windows Agent
cd /d "%~dp0"
if not exist ".env" goto configure
set "NODE_EXE=%~dp0node\node.exe"
if exist "%NODE_EXE%" goto run
set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 goto missing_node
:run
echo Epay Windows Agent started. Close this window to stop.
:loop
"%NODE_EXE%" --env-file=".env" launcher.cjs
echo Agent exited. Restarting in 3 seconds.
timeout /t 3 /nobreak >nul
goto loop
:configure
if not exist ".env.example" goto missing_config
copy /b ".env.example" ".env" >nul
if errorlevel 1 goto missing_config
echo Created .env from .env.example. Edit .env, then start again.
pause
exit /b 1
:missing_config
echo Missing .env configuration. Create it before starting the Agent.
pause
exit /b 1
:missing_node
echo Node.js 22 or newer is required.
pause
exit /b 1
