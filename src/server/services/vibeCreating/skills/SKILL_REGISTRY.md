# Skills 注册表

本文件注册所有可用的 Claude Skills，提供技能索引和元数据。

## Skills 列表

| Skill ID | 名称 | 描述 | 版本 | 状态 |
|----------|------|------|------|------|
| `tvc-script` | TVC剧本创作 | 创作TVC广告剧本大纲 | 1.0.0 | ✅ |
| `tvc-storyboard` | TVC脚本创作 | 创作详细的分镜头脚本 | 1.0.0 | ✅ |
| `tvc-reference-images` | TVC参考图生成 | 批量生成参考图片 | 1.0.0 | ✅ |
| `tvc-video-generation` | TVC视频生成 | 批量生成视频片段 | 1.0.0 | ✅ |
| `tvc-background-music` | TVC背景音乐 | 推荐并合成背景音乐 | 1.0.0 | ✅ |
| `tvc-orchestrator` | TVC流程编排 | 编排完整的TVC创作流程 | 1.0.0 | ✅ |

## 使用说明

### 自动触发
当用户输入匹配某个 Skill 的触发条件时，系统会自动加载该 Skill。

### 手动触发
使用 `/skill-name` 格式手动触发特定 Skill，例如：
- `/tvc-script` - 手动触发剧本创作
- `/tvc-reference-images` - 手动触发参考图生成

### Skill 依赖关系

```
tvc-orchestrator (编排器)
    ├── tvc-script (步骤1)
    ├── tvc-storyboard (步骤2)
    ├── tvc-reference-images (步骤3)
    ├── tvc-video-generation (步骤4)
    └── tvc-background-music (步骤5)
```

## MCP 端点

以下 Skills 需要访问外部工具：

| Skill | MCP 端点 | 说明 |
|-------|----------|------|
| `tvc-reference-images` | `image.generate_batch` | 批量图片生成 |
| `tvc-reference-images` | `image.generate_from_ref` | 图生图生成 |
| `tvc-video-generation` | `video.generate_batch` | 批量视频生成 |
| `tvc-video-generation` | `video.generate_from_image` | 图生视频生成 |
| `tvc-background-music` | `music.recommend` | 音乐推荐 |
| `tvc-background-music` | `video.compile` | 视频音乐合成 |

## 更新日志

### 2024-01-20
- 初始版本发布
- 注册 6 个 TVC 创作相关 Skills
