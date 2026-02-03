"""
背景音乐工具
提供背景音乐推荐和视频音频合成功能
"""
from langchain.tools import tool
from coze_coding_dev_sdk.video_edit import VideoEditClient
from coze_coding_utils.runtime_ctx.context import new_context


@tool
def recommend_background_music(
    scene_type: str,
    runtime,
    mood: str = "neutral"
) -> str:
    """
    推荐适合TVC的背景音乐类型和资源
    
    参数:
        scene_type: 场景类型，如 "product"（产品展示）、"brand"（品牌形象）、
                   "story"（故事叙述）、"emotion"（情感共鸣）、"promo"（促销活动）
        mood: 情绪风格，如 "exciting"（激情）、"calm"（平静）、
              "elegant"（优雅）、"energetic"（活力）、"dramatic"（戏剧性），默认为 "neutral"
    
    返回:
        音乐推荐和资源建议
    """
    # 音乐风格匹配表
    music_recommendations = {
        "product": {
            "exciting": {
                "style": "电子/流行，节奏明快",
                "description": "动感十足，突出产品特性，节奏在120-140 BPM",
                "instruments": "合成器、鼓点、贝斯",
                "examples": "Upbeat Corporate, Tech Innovation, Modern Business"
            },
            "calm": {
                "style": "轻音乐/环境音，简约清新",
                "description": "不抢戏，突出产品本身，节奏在60-80 BPM",
                "instruments": "钢琴、轻打击乐、合成器垫",
                "examples": "Minimal Ambient, Clean Tech, Soft Focus"
            },
            "elegant": {
                "style": "古典/轻爵士，精致高雅",
                "description": "提升产品格调，节奏适中，旋律优雅",
                "instruments": "弦乐、钢琴、轻爵士鼓",
                "examples": "Elegant Piano, Sophisticated Jazz, Premium Lifestyle"
            },
            "energetic": {
                "style": "摇滚/电子，充满活力",
                "description": "动感强烈，吸引注意力，节奏140+ BPM",
                "instruments": "电吉他、强劲鼓点、合成器",
                "examples": "High Energy, Rock Action, Dynamic Sports"
            },
            "dramatic": {
                "style": "管弦乐/史诗，震撼有力",
                "description": "营造戏剧效果，突出产品重要时刻",
                "instruments": "交响乐、定音鼓、铜管乐器",
                "examples": "Epic Cinematic, Dramatic Reveal, Grand Impact"
            },
            "neutral": {
                "style": "多功能背景音乐，平衡各种场景",
                "description": "适用于一般产品展示",
                "instruments": "综合乐器组合",
                "examples": "Corporate Uplifting, Positive Energy, Bright Future"
            }
        },
        "brand": {
            "exciting": {
                "style": "现代电子/广告流行",
                "description": "时尚前沿，符合品牌潮流形象",
                "instruments": "合成器、电子鼓、现代音效",
                "examples": "Brand Identity, Modern Vision, Trendsetting"
            },
            "calm": {
                "style": "氛围音乐/自然音效",
                "description": "营造舒适的品牌氛围",
                "instruments": "自然声音、柔和合成器、环境音",
                "examples": "Brand Atmosphere, Peaceful Presence, Gentle Flow"
            },
            "elegant": {
                "style": "古典/精品音乐",
                "description": "体现品牌高端形象",
                "instruments": "古典乐器、精致编曲",
                "examples": "Premium Brand, Luxury Lifestyle, Sophisticated Image"
            },
            "energetic": {
                "style": "流行/舞曲风格",
                "description": "充满活力，展现品牌年轻化",
                "instruments": "流行节拍、动感音效",
                "examples": "Brand Energy, Youthful Spirit, Dynamic Beat"
            },
            "dramatic": {
                "style": "电影感配乐",
                "description": "营造品牌故事感和情感冲击",
                "instruments": "管弦乐、电影音效",
                "examples": "Brand Story, Emotional Journey, Cinematic Impact"
            },
            "neutral": {
                "style": "通用品牌音乐",
                "description": "适用于各类品牌形象展示",
                "instruments": "综合编曲",
                "examples": "Corporate Brand, Professional Image, Trustworthy"
            }
        },
        "story": {
            "exciting": {
                "style": "动作/冒险配乐",
                "description": "推动故事发展，营造紧张感",
                "instruments": "打击乐、合成器、管弦乐",
                "examples": "Story Action, Adventure Journey, Thriller Narrative"
            },
            "calm": {
                "style": "叙事音乐/情感铺垫",
                "description": "温柔讲述，情感细腻",
                "instruments": "钢琴、弦乐、柔和打击乐",
                "examples": "Storytelling, Emotional Narrative, Gentle Journey"
            },
            "elegant": {
                "style": "精致故事配乐",
                "description": "提升故事质感，唯美叙事",
                "instruments": "精致编曲、古典元素",
                "examples": "Elegant Story, Beautiful Narrative, Artistic Journey"
            },
            "energetic": {
                "style": "活力故事音乐",
                "description": "让故事充满动感和生命力",
                "instruments": "流行配乐、动感节奏",
                "examples": "Dynamic Story, Energetic Journey, Lively Narrative"
            },
            "dramatic": {
                "style": "史诗故事配乐",
                "description": "营造宏大故事场景和情感高潮",
                "instruments": "管弦乐、史诗音效",
                "examples": "Epic Story, Grand Narrative, Cinematic Journey"
            },
            "neutral": {
                "style": "通用叙事音乐",
                "description": "适用于各类故事场景",
                "instruments": "综合编曲",
                "examples": "Universal Story, Narrative Background, Story Flow"
            }
        },
        "emotion": {
            "exciting": {
                "style": "激情情感音乐",
                "description": "激发观众情感共鸣，热烈奔放",
                "instruments": "激情乐器、强节奏",
                "examples": "Emotional High, Passionate Moment, Heartbeat"
            },
            "calm": {
                "style": "治愈系音乐",
                "description": "温暖治愈，触动心灵",
                "instruments": "柔和乐器、自然声音",
                "examples": "Healing Touch, Warm Emotion, Gentle Heart"
            },
            "elegant": {
                "style": "唯美情感音乐",
                "description": "优雅动人的情感表达",
                "instruments": "精致乐器、优美旋律",
                "examples": "Elegant Emotion, Beautiful Feeling, Touching Moment"
            },
            "energetic": {
                "style": "活力情感音乐",
                "description": "充满正能量的情感表达",
                "instruments": "积极乐器、动感旋律",
                "examples": "Positive Energy, Uplifting Emotion, Inspiring Moment"
            },
            "dramatic": {
                "style": "戏剧情感音乐",
                "description": "强烈情感冲击，营造戏剧效果",
                "instruments": "管弦乐、情感乐器",
                "examples": "Dramatic Emotion, Heartfelt Journey, Emotional Impact"
            },
            "neutral": {
                "style": "通用情感音乐",
                "description": "适用于各类情感场景",
                "instruments": "综合编曲",
                "examples": "Universal Emotion, Heartfelt Feeling, Emotional Flow"
            }
        },
        "promo": {
            "exciting": {
                "style": "促销热门音乐",
                "description": "紧迫感强，促进购买欲望",
                "instruments": "快节奏、热门音效",
                "examples": "Sale Hype, Limited Time, Hot Deal"
            },
            "calm": {
                "style": "促销引导音乐",
                "description": "温和引导，降低购买压力",
                "instruments": "柔和流行乐",
                "examples": "Promo Guide, Gentle Sale, Smart Shopping"
            },
            "elegant": {
                "style": "高端促销音乐",
                "description": "展现促销价值，不失格调",
                "instruments": "精致编曲",
                "examples": "Premium Promo, Luxury Deal, Exclusive Offer"
            },
            "energetic": {
                "style": "活力促销音乐",
                "description": "激发购买热情，充满活力",
                "instruments": "动感流行乐",
                "examples": "Promo Energy, Sale Action, Dynamic Deal"
            },
            "dramatic": {
                "style": "震撼促销音乐",
                "description": "营造紧迫和震撼效果",
                "instruments": "强烈节奏、音效",
                "examples": "Promo Impact, Flash Sale, Urgent Deal"
            },
            "neutral": {
                "style": "通用促销音乐",
                "description": "适用于各类促销活动",
                "instruments": "综合编曲",
                "examples": "Universal Promo, Sale Background, Offer Music"
            }
        }
    }
    
    # 获取推荐
    scene_rec = music_recommendations.get(scene_type, music_recommendations["product"])
    mood_rec = scene_rec.get(mood, scene_rec["neutral"])
    
    # 免费音乐资源推荐
    free_resources = """
🎵 免费音乐资源推荐：

1. **YouTube Audio Library**
   - 网址: https://www.youtube.com/audiolibrary
   - 特点: 大量免费无版权音乐，适合商业使用

2. **Free Music Archive (FMA)**
   - 网址: https://freemusicarchive.org
   - 特点: 高质量免费音乐，部分需署名

3. **Bensound**
   - 网址: https://www.bensound.com
   - 特点: 专业级免费音乐，适合商业项目

4. **Epidemic Sound**
   - 网址: https://www.epidemicsound.com
   - 特点: 订阅制，但提供试用

5. **AudioJungle**
   - 网址: https://audiojungle.net
   - 特点: 付费音乐，价格合理，质量高

6. **国内资源**
   - 网易云音乐: 搜索"商用音乐"、"无版权音乐"
   - 腾讯音乐: 付费商用音乐库
   - 阿里音乐: 商用音乐授权服务
"""
    
    recommendation = f"""
🎼 背景音乐推荐

【场景类型】{scene_type}
【情绪风格】{mood}

✨ 推荐音乐风格：
- {mood_rec['style']}
- {mood_rec['description']}
- 主要乐器：{mood_rec['instruments']}
- 参考示例：{mood_rec['examples']}

🎬 使用建议：
1. 音乐时长应与视频长度匹配
2. 音量控制在-15dB到-10dB，避免盖过旁白
3. 可以在关键时刻使用淡入淡出效果
4. 注意音乐的版权问题，确保可商用

{free_resources}

💡 下一步：
请选择合适的音乐文件（MP3格式），然后使用 compile_video_with_music 工具将音乐与视频合成。
"""
    
    return recommendation


@tool
def compile_video_with_music(
    video_url: str,
    audio_url: str,
    runtime,
    keep_original_audio: bool = False,
    audio_volume: float = 0.5
) -> str:
    """
    将背景音乐与视频合成
    
    参数:
        video_url: 视频的URL
        audio_url: 背景音乐的URL（MP3格式）
        keep_original_audio: 是否保留视频原声，默认为False
        audio_volume: 背景音乐音量（0.0-1.0），默认为0.5（50%）
    
    返回:
        合成后的视频URL
    """
    ctx = runtime.context
    music_ctx = new_context(method="video.compile.audio")
    
    client = VideoEditClient(ctx=music_ctx)
    
    try:
        response = client.compile_video_audio(
            video=video_url,
            audio=audio_url,
            is_audio_reserve=keep_original_audio
        )
        
        if response.url:
            return f"""
✅ 视频与音乐合成成功！

📹 视频 URL: {video_url}
🎵 音乐 URL: {audio_url}
🎬 合成后视频 URL: {response.url}

⚙️ 合成参数：
- 保留原声：{'是' if keep_original_audio else '否'}
- 音乐音量：{audio_volume * 100}%

💡 提示：
- 合成后的视频已包含背景音乐
- 可以根据需要调整音量参数重新合成
- 建议测试播放，确保音乐与画面节奏匹配
"""
        else:
            return f"❌ 视频与音乐合成失败。请检查URL是否有效。"
    except Exception as e:
        return f"❌ 合成出错: {str(e)}"


@tool
def get_music_style_guide(runtime) -> str:
    """
    获取音乐风格选择指南
    
    返回:
        音乐风格选择指南
    """
    guide = """
🎹 TVC背景音乐风格选择指南

【场景类型与音乐匹配】

1️⃣ 产品展示类
   - 激情场景：电子/流行，120-140 BPM
   - 平静场景：轻音乐/环境音，60-80 BPM
   - 高端产品：古典/轻爵士，精致优雅
   - 运动产品：摇滚/电子，140+ BPM

2️⃣ 品牌形象类
   - 年轻品牌：现代电子/广告流行
   - 科技品牌：氛围音乐/环境音
   - 奢侈品牌：古典/精品音乐
   - 时尚品牌：流行/舞曲风格

3️⃣ 故事叙述类
   - 动作场景：动作/冒险配乐
   - 情感场景：叙事音乐/情感铺垫
   - 精致故事：精致故事配乐
   - 史诗故事：史诗故事配乐

4️⃣ 情感共鸣类
   - 激情情感：激情情感音乐
   - 治愈情感：治愈系音乐
   - 唯美情感：唯美情感音乐
   - 正能量：活力情感音乐

5️⃣ 促销活动类
   - 紧急促销：促销热门音乐，快节奏
   - 引导促销：促销引导音乐，温和
   - 高端促销：高端促销音乐，精致
   - 活力促销：活力促销音乐，动感

【音乐选择注意事项】

⚠️ 版权问题：
- 必须使用有商用授权的音乐
- 免费音乐需确认授权范围
- 建议使用专业音乐平台

⚠️ 技术参数：
- 格式：推荐MP3，高质量（320kbps）
- 时长：与视频时长匹配
- 音量：-15dB到-10dB（50-70%）
- 频率：44.1kHz或48kHz

⚠️ 艺术效果：
- 音乐不能盖过旁白和对白
- 节奏应与画面节奏匹配
- 注意淡入淡出效果
- 营造合适的情绪氛围

【常见音乐风格词汇】

🎸 流行音乐 (Pop)：现代、时尚、易接受
🎹 古典音乐 (Classical)：高雅、稳重、精致
🎷 爵士音乐 (Jazz)：优雅、复古、成熟
🎧 电子音乐 (Electronic)：现代、科技、前卫
🥁 摇滚音乐 (Rock)：激情、力量、叛逆
🎻 管弦乐 (Orchestral)：宏大、史诗、电影感
🎵 氛围音乐 (Ambient)：放松、环境、背景
🎺 轻音乐 (Light Music)：轻松、愉悦、舒适

💡 使用建议：
- 根据广告整体调性选择音乐风格
- 考虑目标受众的音乐偏好
- 测试不同音乐对广告效果的影响
- 保持音乐风格的统一性
"""
    return guide
