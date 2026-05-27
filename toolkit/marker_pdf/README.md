# Marker PDF Studio

本目录提供一个本地网页面板，用来调用已安装在本机上的 `marker_single`，把 PDF 转换为 Markdown、HTML 或 JSON。

## 启动

在 Windows 下直接双击以下脚本即可：

- `start_marker_pdf.bat`

也可以在当前目录手动启动：

```powershell
E:/Python/python.exe server.py
```

服务启动后默认监听：

- `http://127.0.0.1:8765/`

前端页面文件位于 [web/index.html](web/index.html)。

- 可以直接双击打开
- 也可以用 Live Server 打开
- 但无论哪种打开方式，真正的 PDF 转换接口仍然依赖本地服务 `http://127.0.0.1:8765/`

## 功能

- 上传单个 PDF
- 设置输出目录
- 选择输出格式
- 选择处理模式（平衡 / 文本优先 / 高质量）
- 控制常用 marker 参数
- 实时查看任务日志
- 下载结果 ZIP
- 打开本地输出目录

## 前提

- 本机可执行 `marker_single`
- Python 3 可运行 `server.py`
- 服务仅监听本机 localhost，不对外网暴露

## 输出结构

Marker 默认会在输出根目录下创建与 PDF 同名的子目录，例如：

```text
output/
  sample/
    sample.md
    sample_meta.json
    image_0.jpg
```

网页中的“下载结果 ZIP”会把这个同名子目录整体打包。

上传到网页的原始 PDF 会先暂存在 `jobs/<job_id>/source/`，任务成功或失败后会自动清理；长期保留的数据只包括输出目录和生成的 ZIP。

## 性能建议

- 日常先用“平衡模式”，它会降低页面渲染 DPI，并使用更轻的 OCR。
- 如果 PDF 本身就能复制文字，优先用“文本优先”，它会跳过 OCR 和图片提取，硬件负担最低。
- 先给“页码范围”填 `0-2` 之类的小范围预览，确认效果后再跑全文。
- “高质量”更适合最终导出，不适合随手预览。