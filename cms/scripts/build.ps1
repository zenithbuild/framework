# Colors (basic for PowerShell)
function Write-Color($Text, $Color="White") {
    Write-Host $Text -ForegroundColor $Color
}

$ExtensionsPath = "./extensions"

# Loop through each subdirectory in ./extensions
Get-ChildItem -Path $ExtensionsPath -Directory | ForEach-Object {
    $Dir = $_.FullName
    $Name = $_.Name

    Write-Color "🚀 Starting build for $Name..." Cyan

    Set-Location $Dir
    $StartTime = Get-Date

    Write-Color "📦 Installing dependencies..." Yellow
    try {
        npm install | Out-Null
    } catch {
        Write-Color "❌ Failed to install dependencies for $Name" Red
        Set-Location -Path $PSScriptRoot
        return
    }

    Write-Color "🔧 Building extension..." Yellow
    try {
        npm run build | Out-Null
    } catch {
        Write-Color "❌ Build failed for $Name" Red
        Set-Location -Path $PSScriptRoot
        return
    }

    $EndTime = Get-Date
    $Duration = ($EndTime - $StartTime).TotalSeconds
    Write-Color "✔ Done building $Name in ${Duration}s`n" Green

    Set-Location -Path $PSScriptRoot
}

Write-Color "🎉 All extensions processed!" Blue
