@echo off
rem ===================================================================
rem  Recapitulatif Preparation des jobs (ProgressionLive) -> Luna : 8 h a completer +
rem  a confirmer (case Confirmer client), 13 h rappel des jobs encore a confirmer
rem  Lance par la tache planifiee "Recap preparation des jobs Portail e-Trak"
rem  (8:00 et 13:00 lun-ven + ouverture/deverrouillage de session ; le script
rem  n envoie qu une fois par creneau : 8 h-midi, 13 h-17 h, en semaine).
rem  1) git pull --ff-only (sans conflit seulement), 2) scripts\recap_prep_jobs.py
rem  Les arguments sont transmis au script : --releve sur le poste de Steve
rem  (installe par scripts\installer_releve_recap.ps1).
rem  Journal : %USERPROFILE%\CLAUDE_CODE\recap_prep_jobs.log
rem ===================================================================
setlocal
set "REPO=%~dp0.."
set "LOG=%USERPROFILE%\CLAUDE_CODE\recap_prep_jobs.log"
set PYTHONIOENCODING=utf-8
if not exist "%USERPROFILE%\CLAUDE_CODE" mkdir "%USERPROFILE%\CLAUDE_CODE"
set "PY=py -3.13"
py -3.13 --version >nul 2>&1 || set "PY=py -3.12"
git -C "%REPO%" pull --ff-only -q >> "%LOG%" 2>&1
if errorlevel 1 echo (mise a jour du portail impossible sans conflit : version locale) >> "%LOG%"
cd /d "%REPO%"
%PY% scripts\recap_prep_jobs.py %* >> "%LOG%" 2>&1
set "CODE=%errorlevel%"
echo code de sortie : %CODE% >> "%LOG%"
exit /b %CODE%
