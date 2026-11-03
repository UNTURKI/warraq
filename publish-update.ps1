# Publishes a new version: every installed copy then offers it to its user.
#   powershell -ExecutionPolicy Bypass -File publish-update.ps1 -Version 1.0.2 -NotesFile notes.txt
# notes.txt: what is new, in Arabic (UTF-8). It is shown to the user in the update message.
# Needs: Node.js, Git and GitHub CLI signed in to the repository owner's account.
param([Parameter(Mandatory)][string]$Version, [Parameter(Mandatory)][string]$NotesFile, [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location -LiteralPath $root
$appName = -join [char[]](0x0648, 0x0631, 0x064E, 0x0651, 0x0627, 0x0642)
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Version must look like 1.0.2' }
if (-not (Test-Path -LiteralPath $NotesFile)) { throw "Notes file not found: $NotesFile" }
$git = (Get-Command git -ErrorAction SilentlyContinue).Source; if (-not $git) { $git = 'C:\Program Files\Git\cmd\git.exe' }
$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source; if (-not $gh) { $gh = 'C:\Program Files\GitHub CLI\gh.exe' }
& $gh auth status | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not signed in: run "gh auth login"' }

# 1) version
$pkgFile = Join-Path $root 'package.json'
$pkg = [IO.File]::ReadAllText($pkgFile)
$pkg = [regex]::Replace($pkg, '(?m)^(  "version": ")[^"]+(")', "`${1}$Version`${2}")
[IO.File]::WriteAllText($pkgFile, $pkg, (New-Object Text.UTF8Encoding($false)))

# 2) build
if (-not $SkipBuild) {
  $env:ELECTRON_BUILDER_CACHE = "$root\.cache\electron-builder"; $env:electron_config_cache = "$root\.cache\electron"; $env:TEMP = "$root\.cache\temp"; $env:TMP = "$root\.cache\temp"
  New-Item -ItemType Directory -Force $env:TEMP | Out-Null
  & npm run dist
  if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'build\setup-ui\build.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'Setup window build failed' }
}
$setup = Join-Path $root "dist\Alwarraq-Setup-$Version.exe"
if (-not (Test-Path -LiteralPath $setup)) { throw "Installer not found: $setup" }
$asset = Join-Path $root 'dist\Alwarraq-Setup.exe'
Copy-Item -LiteralPath $setup -Destination $asset -Force

# 3) source, then the release with the installer under its fixed name
& $git add -A
& $git commit -m "$appName $Version"
if ($LASTEXITCODE -ne 0) { Write-Host 'Nothing new to commit' }
& $git push origin HEAD
if ($LASTEXITCODE -ne 0) { throw 'git push failed' }
& $gh release create "v$Version" $asset --title "$appName $Version" --notes-file $NotesFile --latest
if ($LASTEXITCODE -ne 0) { throw 'Release failed' }

# 4) what GitHub holds must be what was built
$local = (Get-FileHash -LiteralPath $asset -Algorithm SHA256).Hash.ToLower()
$remote = & $gh api "repos/UNTURKI/warraq/releases/tags/v$Version" --jq '.assets[] | select(.name=="Alwarraq-Setup.exe") | .digest'
if ($remote -ne "sha256:$local") { throw "Uploaded file does not match: $remote vs $local" }
Write-Host "Published v$Version  sha256:$local"
