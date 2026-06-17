# MIDI Toolkit

三个在线 MIDI 工具。

## 页面

| 文件 | 功能 |
|------|------|
| [index.html](index.html) | 可视化播放器 — 瀑布流/钢琴卷帘实时显示 MIDI 音符，支持多音轨控制 |
| [score_demo.html](score_demo.html) | 五线谱查看器 — MIDI 转标准乐谱，支持分页浏览和跟随播放 |
| [piano.html](piano.html) | 模拟钢琴 — 37 键可弹奏钢琴，支持鼠标、触摸和自定义键盘映射 |

## 结构

```
├── index.html / piano.html / score_demo.html
├── css/
│   ├── toolkit-shared.css   # 共享样式（变量、头部栏、底部栏、导航、主题切换）
│   ├── visualizer.css       # 可视化播放器样式
│   └── piano.css            # 模拟钢琴样式
└── js/
    ├── piano.js             # 钢琴交互逻辑
    ├── score_demo.js        # 五线谱渲染与播放
    ├── core/
    │   └── midi-utils.js    # MIDI 解析工具
    ├── engines/
    │   ├── audio-engine.js      # 音频引擎基类
    │   ├── tone-engine.js       # Tone.js 快速模式
    │   └── fluidsynth-engine.js # FluidSynth 高质量模式
    └── visualizer/
        └── app.js           # 可视化主程序
```

## 技术栈

- [Tone.js](https://tonejs.github.io/) — 音频合成
- [@tonejs/midi](https://github.com/Tonejs/Midi) — MIDI 文件解析
- [Verovio](https://www.verovio.org/) — MEI 乐谱渲染
- [FluidSynth](https://www.fluidsynth.org/) — 高质量音源
