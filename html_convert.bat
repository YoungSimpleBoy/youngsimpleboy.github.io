@echo off
chcp 65001 >nul
title 博客文章转换工具
echo ========================================
echo      博客文章转换工具 (交互式)
echo ========================================
echo.

:: 1. 输入文件
:input_input
set input_file=
set /p input_file=请输入要转换的HTML文件名（例如 三维空间旋转变换与平面镜像变换.html）：
if "%input_file%"=="" (
    echo 输入不能为空，请重新输入！
    goto input_input
)

:: 2. 输出文件
:input_output
set output_file=
set /p output_file=请输入输出文件路径（例如 posts/三维空间旋转变换与平面镜像变换.html）：
if "%output_file%"=="" (
    echo 输入不能为空，请重新输入！
    goto input_output
)

:: 3. 日期（使用 post_date 避免与系统变量冲突）
set post_date=
echo 请输入文章日期（YYYY-MM-DD，直接回车使用今天）：
set /p post_date=

:: 将用户输入的日期中的斜杠替换为短横线（如果用户输入了）
if not "%post_date%"=="" set post_date=%post_date:/=-%

:: 4. 分类
set category=
echo 请输入文章分类（直接回车默认为“综合”）：
set /p category=

:: 5. 标签
set tags=
echo 请输入文章标签（多个标签用空格分隔，直接回车默认为“笔记”）：
set /p tags=

:: 6. 摘要
set excerpt=
echo 请输入文章摘要（直接回车自动从正文提取）：
set /p excerpt=

echo.
echo ---------- 参数预览 ----------
echo 输入文件： %input_file%
echo 输出文件： %output_file%
echo 日期：     %post_date% （空则使用今天）
echo 分类：     %category%
echo 标签：     %tags%
echo 摘要：     %excerpt%
echo ------------------------------
echo.

:: 确认执行
set confirm=
set /p confirm=确认执行？(Y/N)：
if /i not "%confirm%"=="Y" (
    echo 操作已取消。
    pause
    exit /b
)

:: 构造命令行参数
set args=%input_file% %output_file%
if not "%post_date%"=="" set args=%args% --date %post_date%
if not "%category%"=="" set args=%args% --category "%category%"
if not "%tags%"=="" set args=%args% --tags %tags%
if not "%excerpt%"=="" set args=%args% --excerpt "%excerpt%"

:: 调用 Python 脚本
echo 正在执行转换...
python "%~dp0toolkit/html_convert.py" %args%

:: 转换完成后，询问是否打开文章和主页
echo.
set open=
set /p open=转换完成！是否打开文章页面？(Y/N)：
if /i "%open%"=="Y" start "" "%output_file%"

set open_index=
set /p open_index=是否打开博客主页？(Y/N)：
if /i "%open_index%"=="Y" start "" "index.html"

pause