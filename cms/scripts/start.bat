@echo off
setlocal enabledelayedexpansion

REM Exit if any command fails
set ERRLEV=0

REM Function-like error handler
:checkEnv
IF "%~1"=="" (
    echo ❌ %~2 environment variable is not set.
    exit /b 1
)
goto :eof

REM Check required environment variables
call :checkEnv "%ADMIN_EMAIL%" "ADMIN_EMAIL"
call :checkEnv "%ADMIN_PASSWORD%" "ADMIN_PASSWORD"

REM Start Directus in background
echo 🚀 Starting Directus...
start /B cmd /C "npx directus start"
set DIRECTUS_STARTED=true

REM Wait for Directus to be ready
echo ⏳ Waiting for Directus to be ready...
:waitLoop
curl -s http://localhost:8055/server/ping | findstr "pong" >nul
IF errorlevel 1 (
    timeout /t 2 >nul
    goto waitLoop
)

echo ✅ Directus is ready.

REM Apply the local template using admin email and password
echo 📦 Applying template...
npx directus-template-cli@latest apply -p --directusUrl="http://localhost:8055" --userEmail="%ADMIN_EMAIL%" --userPassword="%ADMIN_PASSWORD%" --templateLocation="./templates" --templateType="local"

IF errorlevel 1 (
    echo ❌ Template failed to apply.
    exit /b 1
)

echo 🎉 Template applied successfully.

REM This script doesn’t have a way to “wait” for the background process,
REM but in Windows the Directus server keeps running in the started window.

exit /b 0

