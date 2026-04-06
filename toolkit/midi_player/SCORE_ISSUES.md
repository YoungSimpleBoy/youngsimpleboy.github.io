# MIDI 乐谱渲染问题记录

> 项目：`midi_player/score_demo.html` + `score_demo.js`  
> 渲染引擎：VexFlow 4 / MIDI 解析：@tonejs/midi  

---

## 问题一：钢琴音符全部挤进高音谱表

**现象**  
所有音符（含低音声部）都渲染到单独一个高音谱表，低音根本无法显示。

**根因**  
原始实现只有 `drawScore()`，使用单个高音谱表，没有任何联合谱（Grand Staff）逻辑。

**修复**  
- 新增 `buildPianoMeasures()` 按分割点将音符分流到高音/低音两个 track
- 新增 `drawPianoScore()` 渲染大谱表：使用 `VF.StaveConnector` 加大括号和单左/右竖线
- HTML 增加 Piano Mode 复选框和分割点选择器（C4/G3/A3/D4/E4）

---

## 问题二：调号 / 拍号 / 速度 / 乐器名未显示在乐谱上

**现象**  
渲染区域没有任何元数据信息，不知道调号、节奏等。

**根因**  
原始代码未提取 MIDI header 中的元数据，也未调用 VexFlow 的 `addKeySignature()` / `addTimeSignature()`。

**修复**  
- 新增 `extractScoreMeta()` 从 MIDI header 提取 bpm / 拍号 / 调号 / 乐器名
- 新增 `updateScoreInfoBar()` 更新页面上的 badge 信息栏
- 每个行首谱表调用 `addKeySignature(keySigName)` 和 `addTimeSignature()`
- 在 SVG 顶部用 `ctx.fillText()` 绘制乐器名（斜体）和 ♩=BPM 标记

---

## 问题三：所有音符都断开，没有符杆连接（beaming）

**现象**  
8 分音符、16 分音符每个都是独立符头，没有连接在一起的"符杠"。

**根因**  
代码中没有调用任何 beaming 逻辑。

**修复**  
调用 `VF.Beam.generateBeams(vfNotes, { groups: [...] })` 自动生成符杠。

---

## 问题四：附点音符出现双点（Double-dot）

**现象**  
附点四分音符显示为双附点，视觉错误。

**根因**  
`DURATIONS` 表中时值使用了 `'qd'`、`'hd'`、`'8d'` 这种 VexFlow 内置的带点时值代码，同时还调用了 `addDotToAll()`，导致两次加点。

**修复**  
- 将 `DURATIONS` 表改为基础时值名（`'q'`、`'h'`、`'8'`、`'16'`）+ 独立 `dot: boolean` 标志
- `buildVfNotes()` 中仅当 `dot === true` 时才调用 `addDotToAll()`，不再使用带后缀的时值代码

---

## 问题五：音符时值识别质量差（远不如 MuseScore）

**现象**  
大量本应是四分音符或二分音符的地方，被识别成 8 分音符或更短的时值，整体质量很差。

**根因**  
原始逻辑使用 MIDI 的 `note.durationTicks`（note-off 时刻）估算时值。但 MIDI 演奏中演奏者会刻意缩短实际按键时长（detached/staccato），note-off 比记谱时值短很多，无法代表乐谱上的书写时值。

**修复**  
改用 **IOI（Inter-Onset Interval，相邻起音间隔）** 估算书写时值：  
- 若 note-off 时长 < IOI × 0.92，说明是演奏缩短，使用 IOI 作为书面时值
- 否则使用 note-off 时长（legato 演奏）
- 新增三连音检测：3 个等间距起音 spanning ~1 拍或 ~2 拍 → 生成 `VF.Tuplet`
- 新增跨小节连音线分割：使用 `VF.StaveTie` + `null` first/last_note 半弧

---

## 问题六：多余的升号和降号符号

**现象**  
乐谱中大量音符前出现不必要的 `#` 或 `b` 符号，包括调号内已包含的音（如 D 大调中不应再标 F#/C#）、同一小节内重复出现的变音等。

**根因**  
`buildVfNotes()` 对每一个 `IS_BLACK_KEY` 的音符都强制调用 `sn.addAccidental(i, new VF.Accidental(n.accidental))`，完全绕过了 VexFlow 的变音符自动管理机制，不考虑：
1. 音符是否已在调号范围内（不需要加符号）
2. 同一小节内此变音是否已出现过（不需要重复加）
3. 是否需要还原号 ♮（更是无法处理）

**修复**  
- 移除 `buildVfNotes()` 中所有手动 `addAccidental` 的代码
- 改用 `VF.Accidental.applyAccidentals([voice], keySigName)` 在 Voice 创建后由 VexFlow 自动处理变音符逻辑（含调号豁免、小节内记忆、还原号）

---

## 问题七：三连音符杠（beam）渲染异常

**现象**  
三连音组内的 8 分音符没有被正确连接，有时还会跟相邻的非三连音音符连在一起，形成错误的符杠。  
三连音括号（"3"标记）位置也有时出现错误。

**根因**  
`VF.Beam.generateBeams()` 不知道三连音的组边界，会把三连音组内的音符和相邻普通音符连在一起。  
另外，`Tuplet` 在 `beam` 之前绘制时，brackets 的层级不正确。

**修复**  
- 在 `buildVfNotes()` 中对 8 分三连音组单独创建 `new VF.Beam(tripletNotes)`
- 将三连音音符加入 `tupletNoteSet`，调用 `generateBeams()` 时只传入非三连音音符 (`nonTupletNotes`)，避免跨组连接
- 调整渲染顺序：`tripletBeams → generateBeams → tuplets`，确保"3"括号最后绘制在最上层

---

## 问题八：大量不合理的休止符

**现象**  
乐谱中出现非常多不应出现的短休止符（32 分音符 / 附点 16 分音符）散布在音符之间。

**根因（两点）**  

**8.1 量化残差**  
IOI 估算出时值后，`ticksToDur()` 量化到最近标准时值，但原始 IOI 与量化结果之间存在残差。例如 IOI = 540 ticks，量化到四分音符（480），残差 60 ticks。旧阈值 `ppq * 0.12`（≈57.6）略低于该残差，导致残差被插入为一个 32 分音符休止符。

**8.2 跨小节连音线段末尾残差**  
音符跨小节时，第一段的 `portion`（精确到小节线距离）经过 `ticksToDur()` 量化后，`durTicks` 可能小于 `portion`，差值残留在小节末尾变成一个休止符。

**修复**  
1. 将休止符插入阈值从 `ppq * 0.12` 提高到 `ppq * 0.25`（四分之一拍，= 任意标准时值量化残差的安全上限）
2. 跨小节的首段/中段改用精确的 `portion` 作为 cursor 推进量，视觉时值符号仍保持量化结果，消除尾部缝隙

---

## 当前已知限制（未修复）

| 限制 | 说明 |
|------|------|
| 跨行连音线 | 同一音符跨越不同 SVG 行时，右端半弧可能位置略偏 |
| 复合三连音 | 仅支持 3 个一组的 8 分/四分三连音；不支持五连音等特殊连音 |
| 复杂调号拼写 | 双升 `##` / 还原后升 `n#` 等复合变音符暂不支持 |
| 多声部 | 每个轨道只渲染单声部（无 Voice 1 / Voice 2 分轨显示） |
| 装饰音 | Grace notes 不支持 |
