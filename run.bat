@echo off
title Iniciando o Site

echo Iniciando o servidor...
start node server.js

echo Aguardando o servidor iniciar...
timeout /t 5 /nobreak >nul

echo Abrindo o site no navegador...
start "" "http://localhost:%PORT%"

echo Site iniciado!
pause
