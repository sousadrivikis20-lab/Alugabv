@echo off
title Configurador de Ambiente do Projeto

echo =================================================
echo  Iniciando a configuracao do ambiente...
echo =================================================
echo.

REM --- 1. Verificar se o Node.js e o npm estao instalados ---
echo Verificando a instalacao do Node.js e npm...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado.
    echo Por favor, instale o Node.js a partir de https://nodejs.org/ e tente novamente.
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] npm nao encontrado.
    echo O npm geralmente vem com o Node.js. Verifique sua instalacao em https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo Node.js e npm encontrados.
node -v
npm -v
echo.

REM --- 2. Limpar ambiente antigo (se existir) para garantir uma instalacao limpa ---
echo Verificando instalacoes antigas...
if exist package-lock.json (
    echo Removendo 'package-lock.json' antigo...
    del package-lock.json
)
if exist node_modules (
    echo Removendo a pasta 'node_modules' antiga...
    rmdir /s /q node_modules
)
echo Ambiente limpo.
echo.

REM --- 2. Instalar as dependencias do projeto ---
echo Instalando as dependencias do projeto com 'npm install'. Isso pode levar alguns minutos...
npm install
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar as dependencias com 'npm install'.
    echo Verifique sua conexao com a internet e os logs de erro, e tente novamente.
    echo.
    pause
    exit /b 1
)
echo Dependencias instaladas com sucesso.
echo.

REM --- 3. Configurar o arquivo de ambiente .env ---
echo Verificando o arquivo de ambiente (.env)...
if exist .env (
    echo O arquivo .env ja existe. Nenhuma acao necessaria.
) else (
    echo O arquivo .env nao foi encontrado. Copiando de .env.example.txt...
    copy .env.example.txt .env
    echo O arquivo .env foi criado com sucesso.
)
echo.

REM --- 4. Conclusao ---
echo =================================================
echo  Configuracao concluida com sucesso!
echo =================================================
echo.
echo [IMPORTANTE] Acoes necessarias:
echo 1. Abra o arquivo '.env' que foi criado na pasta do projeto.
echo 2. Altere o valor de 'SESSION_SECRET' para uma chave secreta, longa e aleatoria.
echo.
echo Para iniciar o servidor, execute o comando 'npm start' no seu terminal.
echo.
pause