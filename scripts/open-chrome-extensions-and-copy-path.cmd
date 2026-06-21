@echo off
setlocal

set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
for %%I in ("%~dp0..\extension") do set "EXT=%%~fI"

echo %EXT% | clip

if exist "%CHROME%" (
  start "" "%CHROME%" chrome://extensions/
) else (
  start "" chrome://extensions/
)

echo.
echo 已把扩展文件夹路径复制到剪贴板：
echo %EXT%
echo.
echo 在 Chrome 扩展页面中：
echo 1. 打开“开发者模式”
echo 2. 点击“加载已解压的扩展程序”
echo 3. 粘贴路径并选择 extension 文件夹
echo.
pause
