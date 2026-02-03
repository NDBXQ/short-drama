---
name: tvc-video-generation
description: 基于首帧图和分镜头脚本批量生成分镜视频片段
model:
allowed_tools:
  - generate_videos_from_images_batch
  - recommend_background_music
  - compile_video_with_music
---

# TVC 分镜视频生成

## 核心职责
基于首帧图、分镜头脚本和广告目的，批量生成分镜视频片段，并可推荐背景音乐、编译完整视频。

## 输入参数
- **分镜头脚本**：从步骤3获取的分镜头列表（包含每个镜头的画面描述、动作描述、时长）
- **首帧图**：从步骤4获取的首帧图列表
- **广告目的**：从步骤0获取的广告明确目的
- **美学理念**：从步骤0获取的视觉风格偏好

## 执行步骤

### 1. 提取视频生成参数
从分镜头脚本中提取每个镜头的视频生成参数：
- **镜头序号**
- **首帧图URL**：从步骤4获取
- **视频描述**：如何让图片动起来（基于动作描述）
- **时长**：从分镜头脚本获取（2-5秒）

### 2. 批量生成视频
使用 `generate_videos_from_images_batch` 工具批量生成分镜视频。

**参数设置**：
- 分辨率：建议 720p 或 1080p
- 宽高比：16:9（标准TVC）
- 并发数：使用默认值（2-3），提高生成效率
- 水印：默认关闭

**重要提示**：
- **必须使用时长列表**：`durations` 参数必须是列表 `[3, 2, 4, ...]`，不能使用单一整数

### 3. 推荐背景音乐（可选）
调用 `recommend_background_music` 工具推荐适合的背景音乐。

**推荐依据**：
- 品牌调性：高端、亲民、科技、复古等
- 情感基调：激情、优雅、幽默、温馨等
- 广告目的：品牌形象、产品销售、吸引留资、品牌认知

### 4. 编译完整视频（可选）
调用 `compile_video_with_music` 工具将所有分镜视频和背景音乐编译成完整视频。

## HTML标签规范（本步骤专用）

### 允许使用的特定标签
- `<video_clips>` - 视频片段列表（本步骤专用）

### 严格禁止的标签
- ❌ 所有未在系统提示词"通用HTML标签"和本步骤"特定HTML标签"中定义的标签

### 多行文本处理规则
遵循系统提示词中定义的多行文本处理规则。

## 输出内容结构

### 视频列表
在 `<content>` 标签中使用以下结构：
```html
<video_clips>
  <item>
    <field name="shot_number">1</field>
    <field name="type">视频</field>
    <field name="index">1</field>
    <field name="duration">3</field>
    <field name="description">数据流逐渐形成跑车的3D全息模型，镜头从模型顶部缓缓推进</field>
    <field name="first_frame_index">1</field>
  </item>
  <item>
    <field name="shot_number">2</field>
    <field name="type">视频</field>
    <field name="index">2</field>
    <field name="duration">2</field>
    <field name="description">全息模型突然实体化，蓝色霓虹灯光从车头到车尾依次点亮</field>
    <field name="first_frame_index">2</field>
  </item>
</video_clips>
```

**重要说明**：
- `<field name="index">` 表示视频在数据库中的索引（从1开始）
- 工具返回的是 index，不是 URL
- `<field name="first_frame_index">` 表示使用的首帧图索引（从步骤4获取）
- index 唯一标识一个资源，后续可以通过 index 查询或引用该资源

## 注意事项
- **必须使用时长列表**：durations 参数必须是列表，不能使用单一整数
- 视频描述要精准，明确告诉AI如何让首帧图动起来
- 使用批量工具提高效率
- 生成过程可能较慢，建议并发数设置为 2-3
- 如果遇到限流错误，系统会自动重试最多3次
- 背景音乐要符合品牌调性和情感基调
- 通用HTML标签（<step>、<title>、<content>、<response>、<item>、<fields>、<field>）由系统提示词定义
- 本步骤专用标签（<video_clips>）在技能文件中定义
