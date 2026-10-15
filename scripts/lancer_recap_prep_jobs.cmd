@echo off
rem ===================================================================
rem  Recapitulatif du matin : Preparation des jobs (ProgressionLive) -> Luna
rem  Lance par la tache planifiee "Recap preparation des jobs Portail e-Trak"
rem  (8:00 lun-ven + ouverture/deverrouillage de session ; le script n envoie
rem  qu une fois par jour, en semaine, avant midi).
rem  1) git pull --ff-only (sans conflit seulement), 2) scripts\recap_prep_jobs.py
rem  Journal : %USERPROFILE%\CLAUDE_CODE\recap_prep_jobs.log
rem ===================================================================
setlocal
set "REPO=%~dp0.."
set "LOG=%USERPROFILE%\CLAUDE_CODE\recap_prep_jobs.log"
set PYTHONIOENCODING=utf-8
git -C "%REPO%" pull --ff-only -q >> "%LOG%" 2>&1
if errorlevel 1 echo (mise a jour du portail impossible sans conflit : version locale) >> "%LOG%"
cd /d "%REPO%"
py -3.13 scripts\recap_prep_jobs.py >> "%LOG%" 2>&1
set "CODE=%errorlevel%"
echo code de sortie : %CODE% >> "%LOG%"
exit /b %CODE%
