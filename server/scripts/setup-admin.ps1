$ErrorActionPreference = 'Stop'
$adminName = Read-Host 'Admin name'
$adminEmail = Read-Host 'Admin email'
$adminPassword = Read-Host 'Password (8+ characters with uppercase, lowercase, number and special character; max 72 UTF-8 bytes)' -AsSecureString
$adminConfirm = Read-Host 'Confirm password' -AsSecureString
$passwordPointer = [IntPtr]::Zero
$confirmPointer = [IntPtr]::Zero
try {
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminPassword)
    $confirmPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminConfirm)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $plainConfirm = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmPointer)
    if ($plainPassword -cne $plainConfirm) { throw 'Passwords do not match.' }
    $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    @{ name = $adminName; email = $adminEmail; password = $plainPassword } |
        ConvertTo-Json -Compress | node (Join-Path $PSScriptRoot 'bootstrap-admin.js')
    if ($LASTEXITCODE -ne 0) { throw 'Setup failed. See the safe error above.' }
} finally {
    if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
    if ($confirmPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmPointer) }
    $plainPassword = $null
    $plainConfirm = $null
    $adminPassword.Dispose()
    $adminConfirm.Dispose()
}
