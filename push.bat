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

echo [1/6] Verificando rama actual...
git branch --show-current
if errorlevel 1 (
    echo ERROR: No se pudo obtener la rama actual.
    pause
    exit /b
)
echo.

echo [2/6] Estado actual del repositorio:
git status --short
echo.

REM ===== Validar si hay cambios =====
git diff --quiet
if not errorlevel 1 (
    git diff --cached --quiet
    if not errorlevel 1 (
        echo No hay cambios para commit.
        pause
        exit /b
    )
)

set /p continuar=Hay cambios. Quieres continuar? (S/N): 
if /I not "!continuar!"=="S" (
    echo Cancelado por el usuario.
    pause
    exit /b
)

echo.
echo Escribe el mensaje del commit linea por linea.
echo Cuando termines, escribe FIN y presiona Enter.
echo.

REM ===== Mensaje con fecha =====
set mensaje=-m "[%fecha% %hora%]"

:loop
set /p linea=
if /I "!linea!"=="FIN" goto fin
if "!linea!"=="" goto loop
set mensaje=!mensaje! -m "!linea!"
goto loop

:fin
if "!mensaje!"=="-m [%fecha% %hora%]" (
    echo No escribiste ningun mensaje. Cancelando commit.
    pause
    exit /b
)

echo.
echo [3/6] Agregando archivos...
git add .
if errorlevel 1 (
    echo ERROR: fallo git add .
    pause
    exit /b
)

echo.
echo [4/6] Haciendo commit...
git commit !mensaje!
if errorlevel 1 (
    echo ERROR: fallo git commit.
    echo Puede que no haya cambios reales.
    pause
    exit /b
)

echo.
echo [5/6] Haciendo push a origin main...
git push origin main
if errorlevel 1 (
    echo ERROR: fallo git push
    pause
    exit /b
)

echo.
echo ==========================
echo DONE - Commit y push completados
echo ==========================
echo.

git log --oneline -3

pause