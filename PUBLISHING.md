# Publishing Playbook Live

This project should publish with Git over SSH, not HTTPS.

- Preferred remote: `git@github.com:BBuisson188/playbook-live.git`
- Live site: https://bbuisson188.github.io/playbook-live/
- Local folder: `C:\Users\bbuis\Local Docs\Codex\playbook-live`

## Publish Flow

From normal PowerShell:

```powershell
cd "C:\Users\bbuis\Local Docs\Codex\playbook-live"
.\publish.ps1 -Message "Update Playbook Live"
```

The script follows the normal Git flow:

```powershell
git add .
git commit -m "message"
git pull --rebase
git push
```

## Remote Setup

The repository remote should be SSH:

```powershell
git remote set-url origin git@github.com:BBuisson188/playbook-live.git
git remote -v
```

If `origin` does not exist yet:

```powershell
git remote add origin git@github.com:BBuisson188/playbook-live.git
```

## Fetch-First Push Rejection

If `git push` is rejected with a message like `fetch first`, run:

```powershell
git pull --rebase
git push
```

## Git Write Permission Repair

If Git write permissions fail with `.git/index.lock`, run this from normal PowerShell:

```powershell
cd "C:\Users\bbuis\Local Docs\Codex\playbook-live"
icacls .git /reset /T
icacls .git /inheritance:d /T
git status
```

## GitHub Pages

The app is static and can be served from the repository root. In GitHub:

1. Open the repository settings.
2. Go to Pages.
3. Set the source to deploy from the `main` branch root.
4. Save.

