$ErrorActionPreference = 'Stop'
$ProjectId = '187c97be-a473-4d75-9d95-2ceb6efde05a'
$EnvironmentId = '64d0c072-1383-4b85-a55e-115364b4b39b'
$ServiceId = '2af7305d-111d-49ac-bb49-7e356b8c5433'

Write-Host "Chandrahasa Railway deployment" -ForegroundColor Cyan
if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Install Node.js 20+ first: https://nodejs.org/' }
  Write-Host 'Installing Railway CLI...' -ForegroundColor Yellow
  npm install -g @railway/cli
}
Write-Host 'Railway login will open your browser. Complete sign-in there.' -ForegroundColor Yellow
railway login
if ($LASTEXITCODE -ne 0) { throw 'Railway login failed.' }
Write-Host 'Linking this directory to the existing Chandrahasa production service...' -ForegroundColor Yellow
railway link --project $ProjectId --environment $EnvironmentId --service $ServiceId
if ($LASTEXITCODE -ne 0) { throw 'Could not link Railway project/service.' }
Write-Host 'Uploading source and building on Railway...' -ForegroundColor Yellow
railway up --detach
if ($LASTEXITCODE -ne 0) { throw 'Railway deployment upload failed. Run: railway up' }
Write-Host 'Upload submitted. Check deployment logs and health endpoint in Railway dashboard.' -ForegroundColor Green
Write-Host 'https://railway.com/project/187c97be-a473-4d75-9d95-2ceb6efde05a' -ForegroundColor Cyan
Write-Host 'Do not accept real orders until runtime, checkout, backups and provider sandbox tests pass.' -ForegroundColor Yellow
