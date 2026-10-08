@echo off
chcp 65001 >nul
title ROguard - atualizar e abrir o jogo
cd /d "%~dp0"
set "LOG=%~dp0atualizar_log.txt"
set "DEST=%~dp0Executavel\Vanguarda"

echo.
echo === ROGUARD - compilando e atualizando o executavel ===
echo.

rem --- Node.js e obrigatorio para compilar ---
where npm >nul 2>nul
if errorlevel 1 goto sem_node

rem --- Fecha o jogo antes: arquivo em uso impede a compilacao e a copia ---
taskkill /im ROguard.exe /f >nul 2>&1
taskkill /im Vanguarda.exe /f >nul 2>&1
timeout /t 1 >nul

rem --- Primeira vez: instala as dependencias ---
if exist "node_modules" goto compilar
echo [0/3] Instalando dependencias (primeira vez, pode demorar)...
call npm install --no-audit --no-fund > "%LOG%" 2>&1
if errorlevel 1 goto falhou

:compilar
echo [1/3] Compilando o jogo e gerando o executavel (pode levar alguns minutos)...
call npm run desktop:build >> "%LOG%" 2>&1
if errorlevel 1 goto falhou

echo [2/3] Copiando para a pasta Executavel...
rem o Vanguarda.exe antigo (nome anterior do jogo) sai da pasta para nao confundir
if exist "%DEST%\Vanguarda.exe" del /q "%DEST%\Vanguarda.exe" >nul 2>&1
if not exist "%DEST%" mkdir "%DEST%"
rem robocopy: codigo 0-7 = ok; 8 ou mais = erro de verdade
robocopy "%~dp0release\win-unpacked" "%DEST%" /E /NFL /NDL /NJH /NJS /NP >> "%LOG%"
if errorlevel 8 goto falhou_copia
if not exist "%DEST%\ROguard.exe" goto falhou_copia

echo [3/3] Abrindo o jogo...
echo OK %date% %time%>> "%LOG%"
start "" "%DEST%\ROguard.exe"
goto fim

:sem_node
echo [ERRO] O Node.js nao esta instalado. Instale a versao LTS em https://nodejs.org e rode de novo.
goto fim_erro

:falhou
echo.
echo [ERRO] A compilacao falhou. As ultimas linhas do erro estao abaixo.
echo O log completo esta em atualizar_log.txt - mande esse arquivo para o Claude.
echo.
powershell -NoProfile -Command "Get-Content -Tail 40 -LiteralPath '%LOG%'"
goto fim_erro

:falhou_copia
echo.
echo [ERRO] Nao consegui copiar o jogo para Executavel\Vanguarda.
echo Veja atualizar_log.txt e mande para o Claude.
goto fim_erro

:fim_erro
echo.
pause
exit /b 1

:fim
echo.
echo PRONTO! O jogo foi atualizado e esta abrindo.
echo Para abrir depois: Executavel\Vanguarda\ROguard.exe
timeout /t 3 >nul
exit /b 0
