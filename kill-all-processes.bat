@echo off
echo Killing dev processes...
taskkill /f /im node.exe /im npm.exe /im next.exe /im vite.exe /im yarn.exe /im webpack.exe 2>nul
echo Done!
timeout /t 1 /nobreak >nul