@echo off
REM ============================================================
REM  ATUALIZAR_EXECUTAVEL.bat
REM  Atualiza o executavel do jogo com as ultimas alteracoes.
REM  Uso: dar dois cliques neste arquivo.
REM ============================================================

echo.
echo ============================================================
echo  ATUALIZANDO O EXECUTAVEL DO JOGO...
echo ============================================================
echo.

REM --- 1. Build de producao (typecheck + vite build) ---
echo [1/3] Compilando o jogo...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] O build falhou! Verifique os erros acima.
    pause
    exit /b 1
)
echo.

REM --- 2. Gera o executavel desktop (Electron) ---
echo [2/3] Gerando o executavel desktop...
call npm run desktop:build
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] A geracao do executavel falhou! Verifique os erros acima.
    pause
    exit /b 1
)
echo.

REM --- 3. Copia o executavel para a pasta Executavel ---
echo [3/3] Copiando para a pasta Executavel...
REM fecha o jogo antes: arquivo em uso impede a copia
taskkill /im ROguard.exe /f >nul 2>&1
taskkill /im Vanguarda.exe /f >nul 2>&1
timeout /t 1 >nul
if not exist "Executavel\Vanguarda" mkdir "Executavel\Vanguarda"
REM robocopy: codigo 0-7 = ok; 8 ou mais = erro de verdade (mostrado na tela)
robocopy "release\win-unpacked" "Executavel\Vanguarda" /E /NFL /NDL /NJH /NJS /NP
if %errorlevel% geq 8 (
    echo.
    echo [ERRO] A copia falhou (codigo %errorlevel%). Veja a mensagem acima e mande para o Claude.
    echo O executavel esta em: release\win-unpacked\
    pause
    exit /b 1
)
echo Executavel atualizado em: Executavel\ROguard.exe
echo.
echo ============================================================
echo  PRONTO! Executavel atualizado com sucesso!
echo ============================================================
echo.
echo Localizacoes:
echo   - Executavel: Executavel\Vanguarda\ROguard.exe
echo   - Build web:  dist\
echo.
pause
