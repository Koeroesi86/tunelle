# starts the installed Store package of Tunelle the way the Start menu does
$family = (Get-AppxPackage -Name KrisztianKorosi.Tunelle).PackageFamilyName
if (-not $family) { throw 'The package is not installed' }
Start-Process "shell:AppsFolder\$family!Tunelle"
