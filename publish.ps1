param(
  [string]$Message = "Publish Playbook Live updates"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RemoteUrl = "git@github.com:BBuisson188/playbook-live.git"

Set-Location $ProjectRoot

if (-not (Test-Path ".git")) {
  git init -b main
}

$remotes = git remote
if ($remotes -notcontains "origin") {
  git remote add origin $RemoteUrl
} else {
  $origin = git remote get-url origin
  if ($origin -ne $RemoteUrl) {
    git remote set-url origin $RemoteUrl
  }
}

git add .

$status = git status --short
if (-not $status) {
  Write-Host "No local changes to commit."
} else {
  git commit -m $Message
}

git pull --rebase
git push

