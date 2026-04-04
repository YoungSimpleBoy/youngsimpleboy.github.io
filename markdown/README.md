# youngsimpleboy.github.io

这是一个以静态页面为主的个人站点仓库，包含首页、文章页、资源文件，以及少量辅助工具脚本。

## 项目结构

```text
.
├─ index.html                # 站点首页
├─ about.html                # 关于页面
├─ style.css                 # 全站样式
├─ script.js                 # 全站交互脚本
├─ posts/                    # 博客文章页面与配图
│  ├─ p2026031201.html
│  ├─ ...
│  └─ figs/                  # 文章配图资源
├─ asset/                    # 通用静态资源
│  ├─ avatar.png
│  └─ uma_gif/               # 动图素材
├─ toolkit/                  # 辅助工具
│  ├─ html_convert.py        # HTML 转换脚本
│  ├─ midi_player/           # 独立 MIDI 播放小页面
│     ├─ index.html
│     ├─ app.js
│     ├─ styles.css
│     └─ example_midi/
│  └─ point_group_lab/       # 点群交互可视化页面
│     ├─ index.html
│     ├─ app.js
│     └─ styles.css
└─ markdown/                 # 文档说明目录（本文件所在位置）
```

## 目录职责说明

- `posts/`：存放文章 HTML 页面，文件名通常按日期/编号命名。
- `posts/figs/`：存放文章配图，建议按文章编号分子目录管理。
- `asset/`：存放全站复用的静态资源（头像、GIF 等）。
- `toolkit/`：存放生成/转换脚本和独立的小工具页面，不直接作为博客文章内容。

## 维护建议

- 新增文章时：在 `posts/` 添加页面，并把图片放到 `posts/figs/<文章编号>/`。
- 新增全站资源时：优先放在 `asset/`，避免散落在根目录。
- 新增工具脚本时：统一放在 `toolkit/` 并补充简单使用说明。
