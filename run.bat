@echo off
title Iniciando o Site

echo Iniciando o servidor...
start npm start

echo Aguardando o servidor iniciar...
timeout /t 5 /nobreak >nul

REM Lê a porta do arquivo .port, se existir, senão usa 3000
set PORT=3000
if exist ".port" (
    for /f "usebackq delims=" %%a in (".port") do (
        set "PORT=%%a"
        goto :porta_lida
    )
)
:porta_lida

REM Remove espaços da variável PORT
for /f "tokens=* delims= " %%a in ("%PORT%") do set PORT=%%a

echo Abrindo o site no navegador...
start "" "http://localhost:%PORT%"

echo Site iniciado!
pause
