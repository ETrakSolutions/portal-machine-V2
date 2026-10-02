@echo off
rem ===================================================================
rem  Sauvegarde hebdomadaire du Portail e-Trak -> SharePoint Production
rem  Lance par la tache planifiee "Sauvegarde hebdo Portail e-Trak".
rem  Tous les jours a midi et a l'ouverture de session : le script ne
rem  travaille que le vendredi, ou si la derniere sauvegarde reussie
rem  date de 7 jours ou plus (poste eteint le vendredi).
rem  Journal : %USERPROFILE%\CLAUDE_CODE\sauvegarde_portail.log
rem ===================================================================
setlocal
set "REPO=%~dp0.."
set "LOG=%USERPROFILE%\CLAUDE_CODE\sauvegarde_portail.log"
set PYTHONIOENCODING=utf-8
echo ==== %date% %time% [%COMPUTERNAME%] >> "%LOG%"
git -C "%REPO%" pull --ff-only -q >> "%LOG%" 2>&1
if errorlevel 1 echo (mise a jour du portail impossible sans conflit : version locale) >> "%LOG%"
cd /d "%REPO%"
py -3.13 scripts\sauvegarde_hebdo_portail.py >> "%LOG%" 2>&1
set "CODE=%errorlevel%"
echo code de sortie : %CODE% >> "%LOG%"
exit /b %CODE%
