@echo off
echo Adding Windows Firewall rules for QR Payment app...
echo.
netsh advfirewall firewall add rule name="QR Payment Backend" dir=in action=allow protocol=TCP localport=5001
netsh advfirewall firewall add rule name="QR Payment Frontend" dir=in action=allow protocol=TCP localport=5173
echo.
echo Done! Firewall rules added.
pause
