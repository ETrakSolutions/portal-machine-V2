<#
  Installe (ou met a jour) la tache planifiee « Synchro inventaire Portail e-Trak » sur ce poste.

  La tache lance scripts\lancer_synchro_inventaire.cmd du lundi au vendredi aux heures
  demandees : mise a jour du portail (git pull --ff-only, sans conflit seulement), puis
  quantite en main Epicor (ETRAK/ETRAK) envoyee au portail. Journal :
  %USERPROFILE%\CLAUDE_CODE\sync_inventaire.log

  Poste principal (Steve)          : .\scripts\installer_synchro_inventaire.ps1
  Poste de secours (Jacquot)       : .\scripts\installer_synchro_inventaire.ps1 -Heures 08:15,13:45
  Poste permanent (TI)             : idem, avec les heures voulues

  Deux postes qui synchronisent a 15 minutes d'intervalle ne se genent pas : chaque
  passage lit Epicor en lecture seule et renvoie des quantites a jour (environ 5 s).

  Prerequis verifies : Python 3.12 (py -3.12) avec pyodbc, pilote « ODBC Driver 18 for
  SQL Server », git, fichier « PIN Portail.txt » a la racine du depot, identifiants Epicor
  lecture seule dans %USERPROFILE%\GRYB-MCP\gryb-epicor\credentials.env.
  Un essai sans envoi (--dry-run) est fait avant de creer la tache (-SansEssai pour sauter).
#>
param(
    [string[]]$Heures = @('08:00', '13:30'),
    [switch]$SansEssai
)
# 'Continue' : sous Windows PowerShell 5.1, une ligne ecrite sur stderr par python ou git
# deviendrait une erreur bloquante avec 'Stop'. Chaque verification teste son propre resultat.
$ErrorActionPreference = 'Continue'
$NomTache = 'Synchro inventaire Portail e-Trak'
$Depot = Split-Path -Parent $PSScriptRoot
$Lanceur = Join-Path $PSScriptRoot 'lancer_synchro_inventaire.cmd'
$Journal = Join-Path $env:USERPROFILE 'CLAUDE_CODE\sync_inventaire.log'
# Accepte aussi « 08:15,13:45 » passe en une seule chaine
$Heures = @($Heures | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

function Ok($m)    { Write-Host ('  [OK]   ' + $m) -ForegroundColor Green }
function Echec($m) { Write-Host ('  [ECHEC] ' + $m) -ForegroundColor Red; $script:manque = $true }

Write-Host "`nVerification des prerequis sur $env:COMPUTERNAME ($env:USERNAME)" -ForegroundColor Cyan
$manque = $false
foreach ($h in $Heures) { if ($h -notmatch '^\d{1,2}:\d{2}$') { Echec "Heure invalide : $h (format HH:MM)" } }
if (Test-Path $Lanceur) { Ok "Lanceur : $Lanceur" } else { Echec "Lanceur introuvable : $Lanceur" }
try { $v = (& py -3.12 --version) 2>&1; Ok "Python : $v" } catch { Echec 'Python 3.12 introuvable (commande « py -3.12 »)' }
try {
    $d = (& py -3.12 -c "import pyodbc;print(';'.join(x for x in pyodbc.drivers() if 'ODBC Driver' in x))") 2>&1
    if ($LASTEXITCODE -ne 0) { Echec 'Module pyodbc absent : py -3.12 -m pip install pyodbc' }
    elseif ("$d" -match 'ODBC Driver 1[78] for SQL Server') { Ok "Pilote SQL : $d" }
    else { Echec 'Pilote « ODBC Driver 18 for SQL Server » absent (a installer par les TI)' }
} catch { Echec 'Verification pyodbc impossible' }
try { $g = (& git --version) 2>&1; Ok "Git : $g" } catch { Echec 'git introuvable' }
if (Test-Path (Join-Path $Depot 'PIN Portail.txt')) { Ok 'Fichier PIN Portail.txt present' } else { Echec "« PIN Portail.txt » absent de $Depot (transmis en prive)" }
$cred = Join-Path $env:USERPROFILE 'GRYB-MCP\gryb-epicor\credentials.env'
if (Test-Path $cred) { Ok 'Identifiants Epicor (credentials.env) presents' } else { Echec "Identifiants Epicor absents : $cred" }
if ($manque) { Write-Host "`nInstallation arretee : corrigez les points en ECHEC puis relancez." -ForegroundColor Red; exit 1 }

if (-not $SansEssai) {
    Write-Host "`nEssai sans envoi (lecture Epicor, rien n'est envoye au portail)..." -ForegroundColor Cyan
    Push-Location $Depot
    try { $sortie = (& py -3.12 scripts\sync_inventaire_epicor.py --dry-run) 2>&1 } finally { Pop-Location }
    $resume = @($sortie | Where-Object { "$_" -match '^Pieces du portail' })
    if ($LASTEXITCODE -ne 0 -or -not $resume) {
        Write-Host ($sortie | Select-Object -Last 8 | Out-String) -ForegroundColor Red
        Write-Host 'Installation arretee : l essai a echoue (voir ci-dessus).' -ForegroundColor Red; exit 1
    }
    Ok ("Essai reussi : " + $resume[0])
}

Write-Host "`nCreation de la tache « $NomTache » (lundi au vendredi : $($Heures -join ', '))" -ForegroundColor Cyan
$jours = 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'
$declencheurs = @($Heures | ForEach-Object { New-ScheduledTaskTrigger -Weekly -DaysOfWeek $jours -At $_ })
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/c "' + $Lanceur + '"')
$reglages = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew
if (Get-ScheduledTask -TaskName $NomTache -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $NomTache -Confirm:$false
    Ok 'Ancienne tache remplacee'
}
Register-ScheduledTask -TaskName $NomTache -Action $action -Trigger $declencheurs -Settings $reglages `
    -Description ("Quantite en main Epicor (ETRAK/ETRAK) vers le Portail e-Trak, lun-ven " + ($Heures -join ' et ') + ". Journal : " + $Journal) | Out-Null
$info = Get-ScheduledTask -TaskName $NomTache | Get-ScheduledTaskInfo
Ok ("Tache creee. Prochain passage : " + $info.NextRunTime)
Write-Host "`nPour tester tout de suite : Start-ScheduledTask -TaskName '$NomTache'  puis lire $Journal`n" -ForegroundColor Cyan
