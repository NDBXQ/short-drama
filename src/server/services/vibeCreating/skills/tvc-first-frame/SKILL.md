---
name: tvc-first-frame
description: 为每个分镜头生成精准的首帧图，作为视频生成的基础
model:
allowed_tools:
  - generate_images_from_references_batch
---

# TVC 首帧图生成

## 核心职责
为每个分镜头生成精准的首帧图，作为视频生成的基础，首帧图要体现美学理念和品牌调性。

## 输入参数
- **分镜头脚本**：从步骤3获取的分镜头列表
- **用户产品图**：从步骤0获取的用户提供的原始产品图（优先使用）
- **参考图**：从步骤2获取的角色、背景等参考图
- **美学理念**：从步骤0获取的视觉风格偏好
- **品牌调性**：从步骤0获取的品牌调性

## 执行步骤

### 1. 提取每个镜头的画面描述
从分镜头脚本中提取每个镜头的画面描述，作为首帧图生成的prompt。

### 2. 风格强化
在画面描述中融入美学理念和品牌调性：
- 视觉风格：简约、奢华、科技、复古等
- 色彩方案：根据品牌调性选择
- 构图方式：符合美学理念
- 光影效果：体现品牌调性

### 3. 选择参考图
为每个镜头选择合适的参考图：
- **优先使用用户产品图**：如果镜头涉及产品展示，必须使用用户提供的原始产品图作为参考
- **使用生成的参考图**：如果镜头涉及角色或场景，使用步骤2生成的对应参考图
- **结合使用**：有些镜头可以同时使用产品图和参考图

### 4. 批量生成首帧图
使用 `generate_images_from_references_batch` 工具批量生成首帧图。

**参数设置**：
- 宽高比：根据分镜头类型选择（全景用16:9，特写用4:3等）
- 并发数：使用默认值（2-3），提高生成效率

## HTML标签规范（本步骤专用）

### 允许使用的特定标签
- `<images>` - 图片列表（本步骤专用）

### 严格禁止的标签
- ❌ 所有未在系统提示词"通用HTML标签"和本步骤"特定HTML标签"中定义的标签

### 多行文本处理规则
遵循系统提示词中定义的多行文本处理规则。

## 输出内容结构

### 首帧图列表
在 `<content>` 标签中使用以下结构：
```html
<images>
  <item>
    <field name="shot_number">1</field>
    <field name="type">首帧图</field>
    <field name="category">全景</field>
    <field name="index">1</field>
    <field name="description">昏暗的数字实验室中，蓝色数据流如星河般汇聚，逐渐形成跑车的3D全息模型（科技感风格）</field>
    <field name="reference_images">index=1（用户产品图）、index=2（场景图）</field>
  </item>
  <item>
    <field name="shot_number">2</field>
    <field name="type">首帧图</field>
    <field name="category">中景</field>
    <field name="index">2</field>
    <field name="description">全息模型突然实体化，蓝色霓虹灯光从车头到车尾依次点亮（奢华风格）</field>
    <field name="reference_images">index=1（用户产品图）、index=3（角色图）、index=2（场景图）</field>
  </item>
</images>
```

**重要说明**：
- `<field name="index">` 表示首帧图在数据库中的索引（从1开始）
- 工具返回的是 index，不是 URL
- `<field name="reference_images">` 表示使用的参考图索引，格式为 `index=N（描述）`
- index 唯一标识一个资源，后续可以通过 index 查询或引用该资源

## 注意事项
- **优先使用用户产品图**：涉及产品展示的镜头必须使用用户原始产品图
- 首帧图要精准对应分镜头的画面描述
- 首帧图要体现美学理念和品牌调性
- 首帧图要包含视频生成的关键信息（场景、角色、道具位置）
- 使用批量工具提高效率
- 通用HTML标签（<step>、<title>、<content>、<response>、<item>、<fields>、<field>）由系统提示词定义
- 本步骤专用标签（<images>）在技能文件中定义
