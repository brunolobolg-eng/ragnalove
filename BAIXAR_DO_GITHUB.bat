@echo off
setlocal
title Baixar do GitHub - ragnalove
cd /d "%~dp0"

set "BRANCH=main"
set "CLAUDE_BRANCH=claude/quirky-fermi-4j377w"

echo ==================================================
echo   Baixando as novidades do GitHub (ragnalove)
echo   Pasta: %CD%
echo ==================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [ERRO] O Git nao esta instalado.
  echo Instale em https://git-scm.com/download/win e rode de novo.
  goto :fim_erro
)

if not exist ".git" (
  echo [ERRO] Esta pasta ainda nao esta ligada ao GitHub.
  echo Rode o ENVIAR_PARA_GITHUB.bat uma vez e depois rode este de novo.
  goto :fim_erro
)

if exist ".git\MERGE_HEAD" (
  echo [ERRO] Existe um conflito pendente de uma juncao anterior.
  echo Nada foi alterado. Chame o Claude para resolver.
  goto :fim_erro
)

git config user.name >nul 2>nul || git config user.name "brunolobolg-eng"
git config user.email >nul 2>nul || git config user.email "brunolobolg@gmail.com"

rem --- Guarda o estado das dependencias para saber se precisa de npm install ---
set "LOCK_ANTES="
for /f %%h in ('git hash-object package-lock.json 2^>nul') do set "LOCK_ANTES=%%h"

rem --- Protege o que voce mudou e ainda nao enviou (nada se perde) ---
echo [1/3] Protegendo suas alteracoes locais...
git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -q -m "Alteracoes locais antes de baixar %date% %time:~0,5%"
  echo       Suas alteracoes foram guardadas. Envie depois com o ENVIAR_PARA_GITHUB.bat.
) else (
  echo       Nenhuma alteracao local.
)

echo.
echo [2/3] Baixando do GitHub...
git fetch -q origin
if errorlevel 1 (
  echo [ERRO] Nao consegui falar com o GitHub. Verifique a internet.
  goto :fim_erro
)

git merge -q --no-edit origin/%BRANCH%
if errorlevel 1 goto :conflito

rem --- Tambem traz o trabalho do Claude, se houver ---
git rev-parse -q --verify "origin/%CLAUDE_BRANCH%" >nul 2>nul
if not errorlevel 1 (
  echo       Trazendo tambem as alteracoes do Claude...
  git merge -q --no-edit "origin/%CLAUDE_BRANCH%"
  if errorlevel 1 goto :conflito
)

echo.
echo [3/3] Conferindo dependencias...
set "LOCK_DEPOIS="
for /f %%h in ('git hash-object package-lock.json 2^>nul') do set "LOCK_DEPOIS=%%h"
if not "%LOCK_ANTES%"=="%LOCK_DEPOIS%" (
  where npm >nul 2>nul
  if errorlevel 1 (
    echo       As dependencias mudaram, mas o Node.js nao esta instalado.
  ) else (
    echo       As dependencias mudaram. Rodando npm install...
    call npm install --no-audit --no-fund
  )
) else (
  echo       Nada para instalar.
)

echo.
echo Ultimas alteracoes na pasta:
git --no-pager log -5 --format="   %%h  %%ad  %%s" --date=format:"%%d/%%m %%H:%%M"
echo.
echo ==================================================
echo   PRONTO! Sua pasta esta atualizada.
echo ==================================================
pause
exit /b 0

:conflito
git merge --abort >nul 2>nul
echo.
echo [ERRO] Seus arquivos e os do GitHub mudaram no mesmo lugar.
echo A juncao foi desfeita e nada foi perdido. Chame o Claude para resolver.
goto :fim_erro

:fim_erro
echo.
pause
exit /b 1
