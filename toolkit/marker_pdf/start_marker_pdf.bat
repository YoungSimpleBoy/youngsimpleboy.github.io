@echo off
setlocal
cd /d "%~dp0"

set "MARKER_PDF_OPEN_BROWSER=1"

if exist "E:\Python\python.exe" (
    "E:\Python\python.exe" server.py
    goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
    python server.py
    goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 server.py
    goto :eof
)

echo Python not found. Please install Python 3 and ensure marker_single is available in PATH.
pause