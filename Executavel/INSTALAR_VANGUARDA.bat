@echo off
chcp 65001 >nul
title Instalador do Vanguarda
cd /d "%~dp0"
echo.
echo  === VANGUARDA - instalador ===
echo.
echo  1/3 Juntando as partes...
copy /b Vanguarda.zip.001+Vanguarda.zip.002+Vanguarda.zip.003+Vanguarda.zip.004+Vanguarda.zip.005+Vanguarda.zip.006 Vanguarda.zip >nul || goto erro
echo  2/3 Extraindo (pode levar 1 minuto)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath 'Vanguarda.zip' -DestinationPath '.' -Force" || goto erro
del Vanguarda.zip >nul 2>&1
echo  3/3 Criando atalho na Area de Trabalho...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut($d+'\Vanguarda.lnk'); $s.TargetPath=(Resolve-Path 'Vanguarda\Vanguarda.exe').Path; $s.WorkingDirectory=(Resolve-Path 'Vanguarda').Path; $s.IconLocation=(Resolve-Path 'Vanguarda\resources\app\electron\icon.ico').Path; $s.Save()"
echo.
echo  Pronto! O jogo esta na pasta "Vanguarda" e ha um atalho na Area de Trabalho.
echo  As partes .zip.00X podem ser apagadas.
echo.
start "" "Vanguarda\Vanguarda.exe"
timeout /t 5 >nul
exit /b 0
:erro
echo.
echo  Algo deu errado. Confira se todas as partes Vanguarda.zip.001 a .006 estao nesta pasta.
pause
exit /b 1
