@echo off
rem ===================================================================
rem  Synchro inventaire Epicor (ETRAK/ETRAK) -> Portail e-Trak
rem  Lance par la tache planifiee creee par installer_synchro_inventaire.ps1.
rem  1) Recupere la derniere version du portail (git pull --ff-only) : seulement
rem     si c'est possible sans conflit ; sinon on continue avec la version
rem     locale (les deux echecs des 2026-09-25 et 2026-09-28 venaient d'une
rem     correction pas encore recuperee sur le poste).
rem  2) Lance scripts\sync_inventaire_epicor.py.
rem  Journal : %USERPROFILE%\CLAUDE_CODE\sync_inventaire.log
rem ===================================================================
setlocal
set "REPO=%~dp0.."
set "LOG=%USERPROFILE%\CLAUDE_CODE\sync_inventaire.log"
echo ==== %date% %time% [%COMPUTERNAME%] >> "%LOG%"
git -C "%REPO%" pull --ff-only -q >> "%LOG%" 2>&1
if errorlevel 1 echo (mise a jour du portail impossible sans conflit : synchro avec la version locale) >> "%LOG%"
cd /d "%REPO%"
py -3.12 scripts\sync_inventaire_epicor.py >> "%LOG%" 2>&1
set "CODE=%errorlevel%"
echo code de sortie : %CODE% >> "%LOG%"
exit /b %CODE%
