' LANCEUR SANS FENETRE  --  wscript.exe lancer_masque.vbs <programme> [arguments...]
'
' Les taches planifiees du portail tournent dans la session ouverte (Outlook COM l'exige) :
' cmd.exe y ouvrirait une console visible a chaque passage. wscript.exe n'a pas de
' fenetre et lance le programme masque (style 0).
' On attend la fin (bWaitOnReturn = True) et on repropage le code de retour : sans ca,
' Task Scheduler croirait la tache finie en une seconde et afficherait toujours 0.

Option Explicit
Dim sh, i, a, cmd

Set sh = CreateObject("WScript.Shell")
If WScript.Arguments.Count = 0 Then WScript.Quit 2

cmd = ""
For i = 0 To WScript.Arguments.Count - 1
  a = WScript.Arguments(i)
  ' wscript retire les guillemets a l'analyse : on les remet sur tout argument avec une espace
  If InStr(a, " ") > 0 Then a = """" & a & """"
  If i > 0 Then cmd = cmd & " "
  cmd = cmd & a
Next

WScript.Quit sh.Run(cmd, 0, True)
