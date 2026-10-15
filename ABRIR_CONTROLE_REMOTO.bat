@echo off
setlocal
title Claude - Controle remoto - ragnalove
cd /d "%~dp0"

echo ==================================================
echo   Claude Remote Control - ragnalove
echo   Pasta: %CD%
echo ==================================================
echo.

where claude >/dev/null 2>nul
if errorlevel 1 (
  echo [ERRO] O Claude Code nao esta instalado.
  echo Instale com: npm install -g @anthropic-ai/claude-code
  echo Depois rode este arquivo de novo.
  pause
  exit /b 1
)

echo Abrindo o controle remoto nesta pasta.
echo Deixe esta janela aberta enquanto trabalha. Para encerrar, feche a janela.
echo.
claude remote-control
echo.
echo O controle remoto foi encerrado.
pause
