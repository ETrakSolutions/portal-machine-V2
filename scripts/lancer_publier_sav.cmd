@echo off
rem ===================================================================
rem  Publication des listes SAV (clients, pieces) -> Portail e-Trak
rem  Lance par la tache planifiee "Publier listes SAV Portail e-Trak".
rem  1) git pull --ff-only (sans conflit seulement), 2) scripts\publier_sav.py
rem  Journal : %USERPROFILE%\CLAUDE_CODE\publier_sav.log
rem ===================================================================
setlocal
set "REPO=%~dp0.."
set "LOG=%USERPROFILE%\CLAUDE_CODE\publier_sav.log"
set PYTHONIOENCODING=utf-8
echo ==== %date% %time% [%COMPUTERNAME%] >> "%LOG%"
git -C "%REPO%" pull --ff-only -q >> "%LOG%" 2>&1
if errorlevel 1 echo (mise a jour du portail impossible sans conflit : version locale) >> "%LOG%"
cd /d "%REPO%"
py -3.13 scripts\publier_sav.py >> "%LOG%" 2>&1
set "CODE=%errorlevel%"
echo code de sortie : %CODE% >> "%LOG%"
exit /b %CODE%
