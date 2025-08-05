@echo off
chcp 65001
cls

:run_or_install
if exist "node_modules" (
    echo Running iOS IPA Renamer...
    node "#iOSIPARenamer.js"
) else (
    echo iOS IPA Renamer
    echo Installing Dependencies...
    call npm install yauzl plist bplist-parser
    goto run_or_install
)

pause
