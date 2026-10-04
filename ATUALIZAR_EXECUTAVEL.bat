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
if not exist "Executavel\Vanguarda" mkdir "Executavel\Vanguarda"
xcopy /Y /E "release\win-unpacked\*" "Executavel\Vanguarda\" >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [AVISO] Nao foi possivel copiar para Executavel\Vanguarda.
    echo O executavel esta em: release\win-unpacked\
) else (
    echo Executavel atualizado em: Executavel\Vanguarda\Vanguarda.exe
)

echo.
echo ============================================================
echo  PRONTO! Executavel atualizado com sucesso!
echo ============================================================
echo.
echo Localizacoes:
echo   - Executavel: Executavel\Vanguarda\Vanguarda.exe
echo   - Build web:  dist\
echo.
pause
