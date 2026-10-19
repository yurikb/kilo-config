---
description: Dispara notificação toast do Windows 10/11 quando uma tarefa termina
agent: code
subtask: true
---

```powershell
Import-Module BurntToast -ErrorAction SilentlylyContinue

param(
    [string]$Message = "Kilo CLI concluiu a tarefa!",
    [string]$Title = "Kilo CLI"
)

New-BurntToastNotification -Text $Title, $Message -Sound "Default" -AppLogo "C:\Windows\System32\cmd.exe"
```