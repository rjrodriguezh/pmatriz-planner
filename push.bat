@echo off
cd /d C:\proyectos\github\pmatriz-planner

setlocal EnableDelayedExpansion

echo ==========================
echo Subiendo cambios a GitHub [%date% %time%]
echo ==========================
echo Escribe el mensaje del commit linea por linea.
echo Cuando termines, escribe FIN y presiona Enter.

set mensaje=

:loop
set /p linea=
if /I "!linea!"=="FIN" goto fin
set mensaje=!mensaje! -m "!linea!"
goto loop

:fin
if "!mensaje!"=="" (
    echo No escribiste ningun mensaje. Cancelando commit.
    pause
    exit /b
)

echo Ejecutando commit...
git add .

git commit !mensaje!
if errorlevel 1 (
    echo Error en commit (posiblemente no hay cambios)
    pause
    exit /b
)

echo Haciendo push...
git push origin main
if errorlevel 1 (
    echo Error en push
    pause
    exit /b
)

echo ==========================
echo DONE
pause