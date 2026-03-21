@echo off
cd /d C:\proyectos\github\pmatriz-planner

echo ==========================
echo Subiendo cambios a GitHub
echo ==========================

git add .
git commit -m "update automatico"
git push origin main

echo ==========================
echo DONE
pause