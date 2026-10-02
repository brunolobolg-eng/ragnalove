@echo off
setlocal
title Enviar para o GitHub - ragnalove
cd /d "%~dp0"

set "REPO=https://github.com/brunolobolg-eng/ragnalove.git"
set "BRANCH=main"

echo ==================================================
echo   Enviando a pasta para o GitHub (ragnalove)
echo   Pasta: %CD%
echo ==================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [ERRO] O Git nao esta instalado.
  echo Instale em https://git-scm.com/download/win e rode de novo.
  goto :fim_erro
)

rem --- Se a pasta ainda nao e um repositorio, liga ela ao GitHub sem apagar nada ---
if not exist ".git" (
  echo Primeira vez nesta pasta: conectando ao GitHub...
  git init -q
  git remote add origin "%REPO%"
  git fetch -q origin %BRANCH%
  if errorlevel 1 (
    echo [ERRO] Nao consegui baixar o historico do GitHub. Verifique a internet.
    goto :fim_erro
  )
  rem reset misto: aponta para o GitHub mas NAO mexe nos seus arquivos
  git reset -q --mixed origin/%BRANCH%
  git branch -q -M %BRANCH%
  git branch -q -u origin/%BRANCH%
)

rem --- Se uma juncao anterior ficou com conflito, nao envia nada ---
if exist ".git\MERGE_HEAD" (
  echo [ERRO] Existe um conflito pendente de um envio anterior.
  echo Nada foi enviado. Chame o Claude para resolver.
  goto :fim_erro
)

rem --- Nome/e-mail do autor (so configura se faltar) ---
git config user.name >nul 2>nul || git config user.name "brunolobolg-eng"
git config user.email >nul 2>nul || git config user.email "brunolobolg@gmail.com"

rem --- Nunca enviar a pasta de build do Electron (arquivos gigantes) ---
findstr /x /c:"release/" .gitignore >nul 2>nul
if errorlevel 1 (
  (echo.& echo release/)>>.gitignore
)

rem --- GitHub recusa arquivos acima de 100 MB: avisa antes ---
powershell -NoProfile -Command "$big = git -c core.quotepath=off ls-files -co --exclude-standard | Where-Object { (Test-Path -LiteralPath $_) -and (Get-Item -LiteralPath $_).Length -gt 95MB }; if ($big) { Write-Host '[ERRO] Arquivos grandes demais para o GitHub (limite 100 MB):'; $big | ForEach-Object { Write-Host ('   ' + $_) }; exit 1 }"
if errorlevel 1 (
  echo Tire esses arquivos da pasta ^(ou coloque no .gitignore^) e rode de novo.
  goto :fim_erro
)

echo [1/3] Juntando as alteracoes...
git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -q -m "Atualizacao %date% %time:~0,5%"
  echo       Alteracoes salvas:
  git -c core.quotepath=off show --stat --oneline --format= HEAD
) else (
  echo       Nenhum arquivo novo ou alterado.
)

echo.
echo [2/3] Trazendo o que ja estava no GitHub...
git pull -q --no-rebase --no-edit origin %BRANCH%
if errorlevel 1 (
  echo [ERRO] Conflito entre seus arquivos e os do GitHub.
  echo Nada foi perdido. Chame o Claude para resolver.
  goto :fim_erro
)

echo.
echo [3/3] Enviando para o GitHub...
git push -u origin %BRANCH%
if errorlevel 1 (
  echo [ERRO] O envio falhou. Se pedir login, entre com sua conta do GitHub e rode de novo.
  goto :fim_erro
)

echo.
echo ==================================================
echo   PRONTO! Tudo enviado para o GitHub.
echo ==================================================
pause
exit /b 0

:fim_erro
echo.
pause
exit /b 1
