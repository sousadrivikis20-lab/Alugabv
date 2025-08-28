@echo off
title Iniciando o Site

echo Iniciando o servidor...
start npm start

echo Aguardando o servidor iniciar...
timeout /t 5 /nobreak >nul

:: Read port from .port file
for /f "usebackq delims=" %%a in (".port") do set PORT=%%a

echo Abrindo o site no navegador...
start http://localhost:%PORT%

echo Site iniciado!
pause
