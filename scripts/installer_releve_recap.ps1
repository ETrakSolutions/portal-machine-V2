<#
  Installe (ou met a jour) la RELEVE du recap « Preparation des jobs » sur ce poste
  (decision Jacquot, 2026-10-20 : le poste de Steve prend le relais quand le portable de
  Jacquot est ferme).

  La tache « Recap preparation des jobs Portail e-Trak (releve) » lance
  scripts\lancer_recap_prep_jobs.cmd --releve du lundi au vendredi a 8 h 30 et 13 h 30,
  et a l'ouverture ou au deverrouillage de session (3 min plus tard). Le script n'envoie
  que si le creneau n'est pas deja fait : le suivi est commun aux deux postes, dans
  _Portail e-Trak\recap_prep_jobs.etat (SharePoint synchronise par OneDrive).
  Le courriel part de la boite Outlook de la personne dont la session est ouverte.

      .\scripts\installer_releve_recap.ps1                    cle ProgressionLive au nom de ce compte Windows
      .\scripts\installer_releve_recap.ps1 -ComptePL jcaron   autre nom de cle dans le coffre
      .\scripts\installer_releve_recap.ps1 -SansEssai         saute l'essai sans envoi

  Prerequis verifies : Python 3.13 ou 3.12 (py) avec pywin32 et keyring, Node.js, git,
  Outlook classique (le nouvel Outlook n'a pas de COM), dossier SharePoint « _Portail
  e-Trak » synchronise, cle ProgressionLive dans le coffre Windows (demandee si absente).
  Un essai sans envoi (--apercu) lit ProgressionLive avant de creer la tache.
  Journal : %USERPROFILE%\CLAUDE_CODE\recap_prep_jobs.log
#>
param(
    [string]$ComptePL = $env:USERNAME,
    [switch]$SansEssai
)
# 'Continue' : sous Windows PowerShell 5.1, une ligne ecrite sur stderr par python ou git
# deviendrait une erreur bloquante avec 'Stop'. Chaque verification teste son propre resultat.
$ErrorActionPreference = 'Continue'
$NomTache = 'Recap preparation des jobs Portail e-Trak (releve)'
$Depot = Split-Path -Parent $PSScriptRoot
$Lanceur = Join-Path $PSScriptRoot 'lancer_recap_prep_jobs.cmd'
$Masque = Join-Path $PSScriptRoot 'lancer_masque.vbs'
$Journal = Join-Path $env:USERPROFILE 'CLAUDE_CODE\recap_prep_jobs.log'
$Moi = "$env:USERDOMAIN\$env:USERNAME"

function Ok($m)    { Write-Host ('  [OK]   ' + $m) -ForegroundColor Green }
function Echec($m) { Write-Host ('  [ECHEC] ' + $m) -ForegroundColor Red; $script:manque = $true }

Write-Host "`nVerification des prerequis sur $env:COMPUTERNAME ($env:USERNAME)" -ForegroundColor Cyan
$manque = $false
foreach ($f in $Lanceur, $Masque) { if (Test-Path $f) { Ok "Present : $f" } else { Echec "Introuvable : $f (git pull ?)" } }

$Py = $null
foreach ($v in '-3.13', '-3.12') {
    & py $v --version *> $null
    if ($LASTEXITCODE -eq 0) { $Py = $v; break }
}
if ($Py) { Ok "Python : py $Py" } else { Echec 'Python 3.13 ou 3.12 introuvable (commande « py »)' }
if ($Py) {
    & py $Py -c "import win32com.client, pythoncom, keyring" *> $null
    if ($LASTEXITCODE -eq 0) { Ok 'Modules pywin32 et keyring' } else { Echec "Modules manquants : py $Py -m pip install pywin32 keyring" }
}
try { $n = (& node --version) 2>&1; Ok "Node.js : $n" } catch { Echec 'Node.js introuvable (necessaire a scripts\prep_jobs_local.js)' }
try { $g = (& git --version) 2>&1; Ok "Git : $g" } catch { Echec 'git introuvable' }
if (Test-Path 'Registry::HKEY_CLASSES_ROOT\Outlook.Application\CLSID') { Ok 'Outlook classique installe' }
else { Echec 'Outlook classique absent : le nouvel Outlook ne permet pas l''envoi automatique' }

if ($Py) {
    Push-Location $PSScriptRoot
    try { $d = (& py $Py -c "from publier_prix import dossier_portail as d; print(d() or '')") 2>&1 } finally { Pop-Location }
    if ("$d".Trim()) { Ok "Suivi commun : $("$d".Trim())\recap_prep_jobs.etat" }
    else { Echec 'Dossier SharePoint « _Portail e-Trak » introuvable : synchroniser E-Trak Production > General avec OneDrive' }
}

if ($Py -and -not $manque) {
    $lire = "import sys, keyring; sys.exit(0 if keyring.get_password('progressionlive-portail', sys.argv[1]) else 1)"
    & py $Py -c $lire $ComptePL *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nCle ProgressionLive absente du coffre (progressionlive-portail / $ComptePL)." -ForegroundColor Yellow
        $s = Read-Host 'Coller la cle API ProgressionLive (rien ne s''affiche), Entree pour annuler' -AsSecureString
        $cle = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
        if ($cle) {
            $ecrire = "import sys, keyring; keyring.set_password('progressionlive-portail', sys.argv[1], sys.stdin.read().strip())"
            $cle | & py $Py -c $ecrire $ComptePL
            $cle = $null
        }
        & py $Py -c $lire $ComptePL *> $null
    }
    if ($LASTEXITCODE -eq 0) { Ok "Cle ProgressionLive au coffre ($ComptePL)" } else { Echec "Cle ProgressionLive absente ($ComptePL)" }
}
if ($manque) { Write-Host "`nInstallation arretee : corrigez les points en ECHEC puis relancez." -ForegroundColor Red; exit 1 }

if (-not $SansEssai) {
    Write-Host "`nEssai sans envoi (lecture ProgressionLive, aucun courriel)..." -ForegroundColor Cyan
    Push-Location $Depot
    try { $env:PYTHONIOENCODING = 'utf-8'; $sortie = (& py $Py scripts\recap_prep_jobs.py --apercu --releve --compte $ComptePL) 2>&1 } finally { Pop-Location }
    $resume = @($sortie | Where-Object { "$_" -match ' jobs, ' })
    if ($LASTEXITCODE -ne 0 -or -not $resume) {
        Write-Host ($sortie | Select-Object -Last 8 | Out-String) -ForegroundColor Red
        Write-Host 'Installation arretee : l essai a echoue (voir ci-dessus).' -ForegroundColor Red; exit 1
    }
    Ok ('Essai reussi : ' + $resume[0])
}

Write-Host "`nCreation de la tache « $NomTache »" -ForegroundColor Cyan
$jours = 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'
$declencheurs = @(
    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek $jours -At '08:30'),
    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek $jours -At '13:30')
)
# Ouverture et deverrouillage de session : rattrapage si le poste dormait a l'heure prevue.
# 3 min de delai pour laisser OneDrive ramener le suivi de l'autre poste.
$ouverture = New-ScheduledTaskTrigger -AtLogOn -User $Moi
$ouverture.Delay = 'PT3M'
$cls = Get-CimClass -Namespace 'ROOT\Microsoft\Windows\TaskScheduler' -ClassName 'MSFT_TaskSessionStateChangeTrigger'
$deverrou = New-CimInstance -CimClass $cls -ClientOnly
$deverrou.StateChange = 8
$deverrou.UserId = $Moi
$deverrou.Delay = 'PT3M'
$deverrou.Enabled = $true
$declencheurs += $ouverture, $deverrou

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -WorkingDirectory $Depot `
    -Argument ('"' + $Masque + '" cmd.exe /c "' + $Lanceur + '" --releve --compte ' + $ComptePL)
# Session ouverte obligatoire : Outlook COM ne fonctionne pas sans elle.
$principal = New-ScheduledTaskPrincipal -UserId $Moi -LogonType Interactive
$reglages = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
if (Get-ScheduledTask -TaskName $NomTache -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $NomTache -Confirm:$false
    Ok 'Ancienne tache remplacee'
}
Register-ScheduledTask -TaskName $NomTache -Action $action -Trigger $declencheurs -Principal $principal -Settings $reglages `
    -Description ("Releve du recap Preparation des jobs vers Luna : lun-ven 8 h 30 et 13 h 30, seulement si le poste de Jacquot n'a pas envoye. Journal : " + $Journal) | Out-Null
$info = Get-ScheduledTask -TaskName $NomTache | Get-ScheduledTaskInfo
Ok ('Tache creee. Prochain passage : ' + $info.NextRunTime)
Write-Host "`nPour tester tout de suite : Start-ScheduledTask -TaskName '$NomTache'  puis lire $Journal" -ForegroundColor Cyan
Write-Host "(hors des creneaux 8 h 30-midi et 13 h 30-17 h, ou si le creneau est deja fait, le journal dira : rien)`n" -ForegroundColor Cyan
