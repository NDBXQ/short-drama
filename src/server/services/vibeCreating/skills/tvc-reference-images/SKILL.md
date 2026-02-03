---
name: tvc-reference-images
description: 批量生成TVC创作所需的参考图（角色、背景、场景等）
model:
allowed_tools:
  - generate_images_batch
  - generate_images_from_references_batch
---

# TVC 参考图生成

## 核心职责
基于剧本、用户产品图和美学理念，批量生成角色、背景、场景等核心参考图。

## 输入参数
- **用户产品图**：从步骤0获取的用户提供的原始产品图（必须保留）
- **剧本大纲**：从步骤1获取的剧本内容
- **美学理念**：从步骤0获取的视觉风格偏好
- **目标受众**：从步骤0获取的目标受众特征
- **角色需求**：从剧本提取的角色列表（角色名称、外观特征、表情动作）
- **背景需求**：从剧本提取的背景列表（场景描述、环境风格）
- **道具需求**：从剧本提取的道具列表（物品描述、使用场景）

## 执行步骤

### 1. 提取参考图需求
从剧本大纲中提取需要生成的参考图类型：
- **角色图**：主要角色、配角、群演等
- **场景背景**：室内场景、室外场景、未来场景等
- **道具物品**：产品周边、关键道具等

### 2. 风格对齐
根据美学理念和目标受众确定风格：
- 视觉风格：简约、奢华、科技、复古等
- 色彩方案：根据品牌调性选择
- 人物造型：符合目标受众审美
- 场景氛围：体现品牌调性

### 3. 保留用户产品图
必须将用户在步骤0提供的原始产品图加入参考图列表，确保后续创作基于实际产品。

### 4. 批量生成参考图
使用 `generate_images_batch` 或 `generate_images_from_references_batch` 工具批量生成参考图。

**参数设置**：
- 宽高比：根据画面需求选择（如 16:9、4:3）
- 并发数：使用默认值（2-3），提高生成效率

## HTML标签规范（本步骤专用）

### 允许使用的特定标签
- `<images>` - 图片列表（本步骤专用）

### 严格禁止的标签
- ❌ 所有未在系统提示词"通用HTML标签"和本步骤"特定HTML标签"中定义的标签

### 多行文本处理规则
遵循系统提示词中定义的多行文本处理规则。

## 输出内容结构

### 参考图列表
在 `<content>` 标签中使用以下结构：
```html
<images>
  <item>
    <field name="type">用户图片</field>
    <field name="category">产品</field>
    <field name="index">1</field>
    <field name="description">产品主图</field>
  </item>
  <item>
    <field name="type">角色图</field>
    <field name="category">角色</field>
    <field name="index">2</field>
    <field name="description">主要角色外观（符合目标受众审美）</field>
  </item>
  <item>
    <field name="type">场景图</field>
    <field name="category">背景</field>
    <field name="index">3</field>
    <field name="description">未来都市街道（体现品牌调性）</field>
  </item>
</images>
```

**重要说明**：
- `<field name="index">` 表示资源在数据库中的索引（从1开始）
- 工具返回的是 index，不是 URL
- index 唯一标识一个资源，后续可以通过 index 查询或引用该资源

## 注意事项
- **必须保留用户产品图**：不能因为生成了新图就丢弃用户原始产品图
- 参考图要与剧本风格一致
- 参考图要符合美学理念和品牌调性
- 角色设计要符合目标受众审美
- 场景背景要体现品牌定位（高端、亲民、科技等）
- 使用批量工具提高效率
- 通用HTML标签（<step>、<title>、<content>、<response>、<item>、<fields>、<field>）由系统提示词定义
- 本步骤专用标签（<images>）在技能文件中定义
