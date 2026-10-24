@echo off
title Parar Servidor ASCII Cam Filter
echo Procurando processos na porta 3000 ou 8443...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
    echo Finalizando processo na porta 3000 (PID: %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8443') do (
    echo Finalizando processo na porta 8443 (PID: %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

echo Servidor finalizado com sucesso!
pause
