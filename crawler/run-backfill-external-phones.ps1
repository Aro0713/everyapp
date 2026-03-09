Set-Location "C:\Users\a4pem\everyapp-app\crawler"

Write-Host "Starting external phone backfill..."

npx tsx src/jobs/backfillExternalPhones.ts

Write-Host ""
Write-Host "Backfill finished"