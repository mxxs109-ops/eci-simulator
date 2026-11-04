@echo off
chcp 65001 >nul
title 恶雌模拟器
cd /d "%~dp0app"
node server.js
pause
