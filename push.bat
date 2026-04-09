@echo off
cd /d C:\proyectos\github\pmatriz-planner

setlocal EnableDelayedExpansion

title Git helper - pmatriz-planner

REM ===== Fecha y hora formateada =====
set fecha=%date:~6,4%-%date:~3,2%-%date:~0,2%
set hora=%time:~0,8%

echo ==========================
echo Subiendo cambios a GitHub [%fecha% %hora%]
echo ==========================
echo.

echo [1/5] Estado actual:
git status --short
echo.

git diff --quiet
if not errorlevel 1 (
    git diff --cached --quiet
    if not errorlevel 1 (
        echo No hay cambios para commit.
        pause
        exit /b
    )
)

set /p continuar=Hay cambios. Continuar? (S/N): 
if /I not "!continuar!"=="S" (
    echo Cancelado.
    pause
    exit /b
)

echo.
echo Escribe SOLO el detalle (sin titulo).
echo Cuando termines, escribe FIN.
echo.

REM ===== TITULO AUTOMATICO =====
set titulo=[%fecha% %hora%] feat: mejoras UI + generacion Lua por pisos + control de rotacion
set mensaje=-m "!titulo!"

:loop
set /p linea=
if /I "!linea!"=="FIN" goto fin
if "!linea!"=="" goto loop
set mensaje=!mensaje! -m "!linea!"
goto loop

:fin

echo.
echo [2/5] git add...
git add .

echo.
echo [3/5] commit...
git commit !mensaje!
if errorlevel 1 (
    echo ERROR en commit
    pause
    exit /b
)

echo.
echo [4/5] push...
git push origin main
if errorlevel 1 (
    echo ERROR en push
    pause
    exit /b
)

echo.
echo ==========================
echo DONE
echo ==========================

git log --oneline -3

pause