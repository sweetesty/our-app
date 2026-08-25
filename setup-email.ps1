# Sets up letter-by-email in one go.
#
# Run it from the project folder:
#   .\setup-email.ps1
#
# It asks for two things — your Gmail address and a Google App Password — then
# deploys the function, stores the secrets, and prints the one line of SQL left
# to run. Nothing is written to disk; the password goes straight to Supabase.

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "  Letter email setup" -ForegroundColor Magenta
Write-Host "  ------------------" -ForegroundColor Magenta
Write-Host ""
Write-Host "  You need a Google App Password first (not your normal password)."
Write-Host "  Get one at: https://myaccount.google.com/apppasswords" -ForegroundColor Cyan
Write-Host ""

$gmail = Read-Host "  Your Gmail address"
if ([string]::IsNullOrWhiteSpace($gmail)) { Write-Host "  Cancelled." -ForegroundColor Yellow; exit 1 }

Write-Host ""
Write-Host "  Paste the 16-character App Password (spaces are fine, they get stripped)."
$secure = Read-Host "  App Password" -AsSecureString
$appPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
)
# Google displays it in groups of four; SMTP wants it without spaces.
$appPassword = $appPassword -replace '\s', ''

if ($appPassword.Length -ne 16) {
  Write-Host ""
  Write-Host "  That is $($appPassword.Length) characters, expected 16." -ForegroundColor Yellow
  Write-Host "  Make sure you copied an App Password, not your Google password." -ForegroundColor Yellow
  exit 1
}

Write-Host ""
$appUrl = Read-Host "  Your live site URL (or press Enter to skip)"

Write-Host ""
Write-Host "  Deploying the function..." -ForegroundColor DarkGray
npx --yes supabase functions deploy send-letter --no-verify-jwt
if ($LASTEXITCODE -ne 0) { Write-Host "  Deploy failed - see above." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  Storing secrets..." -ForegroundColor DarkGray
npx --yes supabase secrets set SMTP_HOST="smtp.gmail.com" | Out-Null
npx --yes supabase secrets set SMTP_PORT="465" | Out-Null
npx --yes supabase secrets set SMTP_USER="$gmail" | Out-Null
npx --yes supabase secrets set SMTP_PASS="$appPassword" | Out-Null
npx --yes supabase secrets set LETTER_FROM="Our Little World <$gmail>" | Out-Null
if (-not [string]::IsNullOrWhiteSpace($appUrl)) {
  npx --yes supabase secrets set APP_URL="$appUrl" | Out-Null
}

# Do not leave the password sitting in the session.
$appPassword = $null
[System.GC]::Collect()

Write-Host ""
Write-Host "  Done." -ForegroundColor Green
Write-Host ""
Write-Host "  One last step - run this in the Supabase SQL editor:" -ForegroundColor Yellow
Write-Host ""
Write-Host "    update private.push_config" -ForegroundColor White
Write-Host "    set email_function_url = 'https://jbxifrsesuyzpiuliwse.supabase.co/functions/v1/send-letter'" -ForegroundColor White
Write-Host "    where id = 1;" -ForegroundColor White
Write-Host ""
Write-Host "  Until that runs, email stays switched off and nothing breaks." -ForegroundColor DarkGray
Write-Host ""
