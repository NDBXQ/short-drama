---
name: tvc-background-music
description: 推荐适合TVC的背景音乐，并将视频与音乐合成为最终作品
model:
allowed_tools: ["music.recommend", "video.compile"]
---

# TVC 背景音乐生成

## 核心职责
1. 分析 TVC 内容和情感基调
2. 推荐合适的背景音乐类型
3. 将视频片段与音乐合成为最终作品
4. 确保音频视频同步流畅

## 触发条件
- 用户说"继续"或"下一步"，且当前在步骤4完成状态
- 用户说"背景音乐"、"音乐"、"合成"

## 输入参数
- **视频片段**：从步骤4获取的视频列表
- **场景类型**：product（产品展示）、brand（品牌形象）、story（故事叙述）、emotion（情感共鸣）、promo（促销活动）
- **情绪风格**：exciting（激情）、calm（平静）、elegant（优雅）、energetic（活力）、dramatic（戏剧性）

## 执行步骤

### 1. 分析内容
分析 TVC 内容，确定：
- 场景类型
- 情绪风格
- 节奏需求

### 2. 推荐音乐
使用 MCP 端点推荐音乐：

```
调用：music.recommend
参数：
- scene_type: 场景类型
- mood: 情绪风格
- duration: 总时长
```

返回结果包含：
- 音乐风格描述
- 乐器推荐
- 节奏要求
- 示例音乐

### 3. 合成视频和音乐
使用 MCP 端点合成：

```
调用：video.compile
参数：
- videos: ["视频1URL", "视频2URL", ...]
- music: 音乐URL或描述
- transitions: ["fade", "cut", ...]
- output_format: 输出格式
```

### 4. 输出格式化
使用 HTML 标签输出最终作品：

```html
<step id="5">
  <title>步骤5：背景音乐与合成</title>
  <section name="音乐推荐">
    <field name="场景类型">product</field>
    <field name="情绪风格">exciting</field>
    <field name="音乐风格">电子/流行，节奏明快</field>
    <field name="乐器">合成器、鼓点、贝斯</field>
    <field name="节奏">120-140 BPM</field>
  </section>
  <section name="最终作品">
    <field name="视频URL">最终视频URL</field>
    <field name="总时长">X秒</field>
    <field name="格式">MP4</field>
  </section>
</step>

<confirmation>
  <message>🎉 恭喜！您的TVC创作完成！</message>
  <message>您可以下载视频并进行进一步编辑。</message>
</confirmation>
```

## 音乐风格参考

### 产品展示
- **激情**：电子/流行，节奏明快，120-140 BPM
- **平静**：轻音乐/环境音，简约清新，60-80 BPM
- **优雅**：古典/轻爵士，精致高雅
- **活力**：摇滚/电子，充满活力，140+ BPM
- **戏剧性**：管弦乐/史诗，震撼有力

### 品牌形象
- **激情**：现代电子/广告流行，时尚前沿
- **平静**：氛围音乐/自然音效，营造舒适氛围
- **优雅**：古典/精品音乐，体现高端形象
- **活力**：流行/舞曲风格，展现年轻化
- **戏剧性**：电影感配乐，营造故事感

## 输出质量标准

✅ 音乐风格与内容匹配
✅ 节奏与画面同步
✅ 音频过渡流畅
✅ 情感基调一致
✅ 视频质量保持
✅ 最终作品完整可用

## 分层加载

- **初始**：仅加载本文件
- **步骤执行时**：按需加载 `scripts/music_recommendation.py`
- **需要时**：加载 `references/music_library.md`

## MCP 端点

- `music.recommend` - 推荐背景音乐
- `video.compile` - 合成视频和音乐
