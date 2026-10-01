@echo off
chcp 65001 >nul
title Atualizador do ROguard
cd /d "%~dp0"
echo.
echo  === ROGUARD - atualizacao (mapas maiores, vida da cidade, aggro, biomas, efeitos novos) ===
echo.
if not exist "Vanguarda\resources\app" (
  echo  Nao achei a pasta "Vanguarda". Rode primeiro o INSTALAR_VANGUARDA.bat nesta mesma pasta.
  pause & exit /b 1
)
taskkill /im Vanguarda.exe /f >nul 2>&1
echo  Substituindo os arquivos do jogo...
rmdir /s /q "Vanguarda\resources\app\web" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath 'Vanguarda_atualizacao.zip' -DestinationPath 'Vanguarda\resources\app' -Force" || goto erro
echo  Atualizando o atalho da Area de Trabalho (novo icone)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); Remove-Item ($d+'\Vanguarda.lnk') -ErrorAction SilentlyContinue; $s=(New-Object -ComObject WScript.Shell).CreateShortcut($d+'\ROguard.lnk'); $s.TargetPath=(Resolve-Path 'Vanguarda\Vanguarda.exe').Path; $s.WorkingDirectory=(Resolve-Path 'Vanguarda').Path; $s.IconLocation=(Resolve-Path 'Vanguarda\resources\app\electron\icon.ico').Path+',0'; $s.Save()"
ie4uinit.exe -show >nul 2>&1
echo  Pronto!
start "" "Vanguarda\Vanguarda.exe"
timeout /t 4 >nul
exit /b 0
:erro
echo  Algo deu errado ao extrair a atualizacao.
pause
exit /b 1
