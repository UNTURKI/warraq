# Compiles the branded setup window and joins it with the NSIS installer into one file.
#   build.ps1           full build: needs dist\Alwarraq-Core-<version>.exe and dist\win-unpacked
#   build.ps1 -UiOnly   compiles the window only, into dist\setup-ui.exe
#   build.ps1 -UiOnly -NoElevate   the same, without the administrator prompt, for testing the window
param([switch]$UiOnly, [switch]$NoElevate)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$ui = $PSScriptRoot
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$version = (Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$exe = Join-Path $dist 'setup-ui.exe'
$fonts = Join-Path $root 'app\public\fonts'
$manifest = Join-Path $ui 'setup.manifest'
if ($NoElevate) {
  $manifest = Join-Path $dist 'setup-test.manifest'
  (Get-Content (Join-Path $ui 'setup.manifest') -Raw).Replace('requireAdministrator', 'asInvoker') | Set-Content $manifest -Encoding UTF8
}
$verCs = Join-Path $dist 'setup-version.cs'
Set-Content $verCs "static class SetupVersion { public const string V = `"$version`"; }" -Encoding UTF8
& $csc /nologo /target:winexe /optimize+ /codepage:65001 /out:$exe `
  "/win32icon:$(Join-Path $root 'build\icon.ico')" "/win32manifest:$manifest" `
  /r:System.Windows.Forms.dll /r:System.Drawing.dll `
  "/resource:$(Join-Path $fonts 'AdwaAssalaf-Bold.ttf'),AdwaAssalaf-Bold.ttf" `
  "/resource:$(Join-Path $fonts 'Amiri-Regular.ttf'),Amiri-Regular.ttf" `
  "/resource:$(Join-Path $root 'electron\waraq-word.png'),waraq-word.png" `
  (Join-Path $ui 'Setup.cs') $verCs
if ($LASTEXITCODE -ne 0) { throw 'csc failed' }
Remove-Item $verCs
if ($UiOnly) { return }

$core = Join-Path $dist "Alwarraq-Core-$version.exe"
$unpacked = (Get-ChildItem (Join-Path $dist 'win-unpacked') -Recurse -File | Measure-Object Length -Sum).Sum
$final = Join-Path $dist "Alwarraq-Setup-$version.exe"
$out = [IO.File]::Create($final)
try {
  foreach ($f in @($exe, $core)) { $in = [IO.File]::OpenRead($f); $in.CopyTo($out, 1048576); $in.Dispose() }
  $w = New-Object IO.BinaryWriter($out)
  $w.Write([long](Get-Item $core).Length)
  $w.Write([long]$unpacked)
  $w.Write([Text.Encoding]::ASCII.GetBytes('WRQSETUP'))
  $w.Flush()
} finally { $out.Dispose() }
Remove-Item $exe
Write-Host "Done: $final"
