@echo off
chcp 65001 >nul
title Atualizador do ROguard (compila o projeto e atualiza o executavel)
cd /d "%~dp0"
set LOG=%~dp0atualizar_log.txt
set APP=%~dp0Executavel\Vanguarda\resources\app
echo.
echo  === ROGUARD - compilando o projeto e atualizando o executavel ===
echo.
if not exist "%APP%" (
  echo  Nao achei "Executavel\Vanguarda". Rode primeiro o INSTALAR_VANGUARDA.bat dentro da pasta Executavel.
  pause & exit /b 1
)
echo  [1/4] Compilando (pode levar 1 minuto)...
call npm run build > "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo  A compilacao falhou. Os erros estao em atualizar_log.txt
  echo  Avise o Claude: ele le esse arquivo e corrige.
  echo.
  type "%LOG%"
  pause & exit /b 1
)
echo  [2/4] Copiando para o executavel...
taskkill /im Vanguarda.exe /f >nul 2>&1
timeout /t 1 >nul
rmdir /s /q "%APP%\dist" >nul 2>&1
rmdir /s /q "%APP%\web" >nul 2>&1
robocopy "%~dp0dist" "%APP%\dist" /E /NFL /NDL /NJH /NJS /NP >> "%LOG%"
if errorlevel 8 goto erro
robocopy "%~dp0electron" "%APP%\electron" /E /NFL /NDL /NJH /NJS /NP >> "%LOG%"
if errorlevel 8 goto erro
echo  [3/4] Aplicando o icone no Vanguarda.exe...
if not exist "%~dp0tools\rcedit-x64.exe" (
  mkdir "%~dp0tools" >nul 2>&1
  powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing 'https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe' -OutFile '%~dp0tools\rcedit-x64.exe'" >> "%LOG%" 2>&1
)
if exist "%~dp0tools\rcedit-x64.exe" "%~dp0tools\rcedit-x64.exe" "%APP%\..\..\Vanguarda.exe" --set-icon "%~dp0electron\icon.ico" >> "%LOG%" 2>&1
echo  [4/4] Abrindo o jogo...
echo OK %date% %time%>> "%LOG%"
start "" "%APP%\..\..\Vanguarda.exe"
timeout /t 3 >nul
exit /b 0
:erro
echo  Algo deu errado ao copiar os arquivos. Veja atualizar_log.txt
pause
exit /b 1
