"""
批量视频生成工具
支持并发生成多个视频，提高多镜头TVC创作效率
"""
import asyncio
import os
import yaml
from langchain.tools import tool
from coze_coding_dev_sdk.video import VideoGenerationClient, TextContent, ImageURLContent, ImageURL
from coze_coding_utils.runtime_ctx.context import new_context


# 加载批量生成配置
def load_batch_config():
    """加载YAML配置文件（每次调用时重新读取，确保配置更新生效）"""
    workspace_path = os.getenv("COZE_WORKSPACE_PATH", "/workspace/projects")
    config_path = os.path.join(workspace_path, "config/batch_config.yaml")
    
    if not os.path.exists(config_path):
        # 如果配置文件不存在，使用默认值
        return {
            'video_generation': {
                'max_concurrent': 3,
                'max_concurrent_from_images': 3
            },
            'time_estimation': {
                'default_video_concurrent': 3
            }
        }
    
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
        return config
    except Exception:
        # 读取失败时使用默认值
        return {
            'video_generation': {
                'max_concurrent': 3,
                'max_concurrent_from_images': 3
            },
            'time_estimation': {
                'default_video_concurrent': 3
            }
        }


# 全局配置缓存（模块加载时初始化）
BATCH_CONFIG = load_batch_config()


@tool
def generate_videos_batch(
    prompts: list,
    runtime,
    resolution: str = "720p",
    ratio: str = "16:9",
    duration: int = 5,
    watermark: bool = False,
    max_concurrent: int = None
) -> str:
    """
    批量并发生成多个视频（文生视频）
    
    参数:
        prompts: 视频描述列表，每个元素是一个字符串，描述一个镜头的视频内容
                 例如：["一个跑酷少年在城市高楼间飞跃", "少年落地后喘息，汗水滑落", "少年拿起饮料仰头喝下"]
        resolution: 视频分辨率，可选值: "480p", "720p", "1080p"，默认为 "720p"
        ratio: 视频宽高比，可选值: "16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"，默认为 "16:9"
        duration: 视频时长（秒），范围 4-12，默认为 5。可以是整数（所有镜头统一时长）或列表（每个镜头独立时长）
        watermark: 是否添加水印，默认为 False
        max_concurrent: 最大并发数，默认从配置文件读取（建议2-3，避免资源消耗过大）
    
    返回:
        所有生成的视频URL列表，按输入顺序返回
    """
    # 如果未指定并发数，从配置文件读取
    if max_concurrent is None:
        max_concurrent = BATCH_CONFIG.get('video_generation', {}).get('max_concurrent', 3)
    
    ctx = runtime.context
    video_ctx = new_context(method="video.batch.generate")
    
    client = VideoGenerationClient(ctx=video_ctx)
    
    # 处理 duration 参数
    if isinstance(duration, int):
        # 如果是整数，所有镜头使用相同时长
        durations = [duration] * len(prompts)
    elif isinstance(duration, list):
        # 如果是列表，每个镜头使用对应时长
        if len(duration) != len(prompts):
            return f"❌ 错误：duration列表长度必须与prompts列表相同！当前：duration={len(duration)}, prompts={len(prompts)}"
        durations = duration
    else:
        return f"❌ 错误：duration参数必须是整数或列表！当前类型：{type(duration)}"
    
    async def generate_with_limit(prompts_list, durations_list, limit):
        """带并发限制的批量生成"""
        semaphore = asyncio.Semaphore(limit)
        
        async def generate_single(prompt, duration_val, index):
            async with semaphore:
                try:
                    video_url, response, _ = await client.video_generation_async(
                        content_items=[TextContent(text=prompt)],
                        model="doubao-seedance-1-5-pro-251215",
                        resolution=resolution,
                        ratio=ratio,
                        duration=duration_val,
                        watermark=watermark,
                        generate_audio=True
                    )
                    return index, video_url, None
                except Exception as e:
                    return index, None, str(e)
        
        tasks = [
            generate_single(prompts_list[i], durations_list[i], i)
            for i in range(len(prompts_list))
        ]
        return await asyncio.gather(*tasks)
    
    try:
        # 运行并发生成
        results = asyncio.run(generate_with_limit(prompts, durations, max_concurrent))
        
        # 整理结果
        video_urls = [None] * len(prompts)
        errors = []
        
        for index, video_url, error in results:
            if video_url:
                video_urls[index] = video_url
            else:
                errors.append(f"镜头{index + 1}生成失败: {error}")
        
        # 生成结果报告
        success_count = sum(1 for url in video_urls if url is not None)
        
        result_text = f"🎬 批量视频生成完成！\n"
        result_text += f"📊 生成统计：成功 {success_count}/{len(prompts)} 个视频\n"
        result_text += f"⚙️ 参数设置：分辨率={resolution}, 宽高比={ratio}, 并发数={max_concurrent}\n"
        
        # 显示时长信息
        if len(durations) > 0:
            if isinstance(duration, int):
                result_text += f"⏱️ 时长：统一 {duration} 秒\n"
            else:
                result_text += f"⏱️ 时长：{durations} 秒（各镜头独立）\n"
        
        result_text += f"\n📹 生成的视频：\n"
        for i, (prompt, url, dur) in enumerate(zip(prompts, video_urls, durations)):
            if url:
                result_text += f"✅ 镜头{i+1}: {url}\n"
                result_text += f"   时长: {dur}秒\n"
                result_text += f"   描述: {prompt[:50]}{'...' if len(prompt) > 50 else ''}\n"
            else:
                result_text += f"❌ 镜头{i+1}: 生成失败\n"
                result_text += f"   时长: {dur}秒\n"
                result_text += f"   描述: {prompt[:50]}{'...' if len(prompt) > 50 else ''}\n"
        
        if errors:
            result_text += f"\n⚠️ 错误信息：\n"
            for error in errors:
                result_text += f"   {error}\n"
        
        return result_text
        
    except Exception as e:
        return f"❌ 批量视频生成出错: {str(e)}"


@tool
def generate_videos_from_images_batch(
    prompts: list,
    image_urls: list,
    runtime,
    resolution: str = "720p",
    ratio: str = "16:9",
    duration: int = 5,
    watermark: bool = False,
    max_concurrent: int = None
) -> str:
    """
    批量并发生成多个视频（图生视频）
    
    参数:
        prompts: 视频描述列表，每个元素是一个字符串，描述如何让图片动起来
        image_urls: 参考图片URL列表，长度必须与prompts相同
        resolution: 视频分辨率，可选值: "480p", "720p", "1080p"，默认为 "720p"
        ratio: 视频宽高比，可选值: "16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"，默认为 "16:9"
        duration: 视频时长（秒），范围 4-12，默认为 5。可以是整数（所有镜头统一时长）或列表（每个镜头独立时长）
        watermark: 是否添加水印，默认为 False
        max_concurrent: 最大并发数，默认从配置文件读取（建议2-3，避免资源消耗过大）
    
    返回:
        所有生成的视频URL列表，按输入顺序返回
    """
    # 如果未指定并发数，从配置文件读取
    if max_concurrent is None:
        max_concurrent = BATCH_CONFIG.get('video_generation', {}).get('max_concurrent_from_images', 3)
    
    if len(prompts) != len(image_urls):
        return f"❌ 错误：prompts和image_urls的长度必须相同！当前：prompts={len(prompts)}, image_urls={len(image_urls)}"
    
    ctx = runtime.context
    video_ctx = new_context(method="video.batch.generate.from_images")
    
    client = VideoGenerationClient(ctx=video_ctx)
    
    # 处理 duration 参数
    if isinstance(duration, int):
        # 如果是整数，所有镜头使用相同时长
        durations = [duration] * len(prompts)
    elif isinstance(duration, list):
        # 如果是列表，每个镜头使用对应时长
        if len(duration) != len(prompts):
            return f"❌ 错误：duration列表长度必须与prompts列表相同！当前：duration={len(duration)}, prompts={len(prompts)}"
        durations = duration
    else:
        return f"❌ 错误：duration参数必须是整数或列表！当前类型：{type(duration)}"
    
    async def generate_with_limit(prompts_list, image_urls_list, durations_list, limit):
        """带并发限制的批量生成"""
        semaphore = asyncio.Semaphore(limit)
        
        async def generate_single(prompt, image_url, duration_val, index):
            async with semaphore:
                try:
                    video_url, response, _ = await client.video_generation_async(
                        content_items=[
                            TextContent(text=prompt),
                            ImageURLContent(
                                image_url=ImageURL(url=image_url),
                                role="first_frame"
                            )
                        ],
                        model="doubao-seedance-1-5-pro-251215",
                        resolution=resolution,
                        ratio=ratio,
                        duration=duration_val,
                        watermark=watermark,
                        generate_audio=True
                    )
                    return index, video_url, None
                except Exception as e:
                    return index, None, str(e)
        
        tasks = [
            generate_single(prompts_list[i], image_urls_list[i], durations_list[i], i)
            for i in range(len(prompts_list))
        ]
        return await asyncio.gather(*tasks)
    
    try:
        # 运行并发生成
        results = asyncio.run(generate_with_limit(prompts, image_urls, durations, max_concurrent))
        
        # 整理结果
        video_urls = [None] * len(prompts)
        errors = []
        
        for index, video_url, error in results:
            if video_url:
                video_urls[index] = video_url
            else:
                errors.append(f"镜头{index + 1}生成失败: {error}")
        
        # 生成结果报告
        success_count = sum(1 for url in video_urls if url is not None)
        
        result_text = f"🎬 批量图生视频完成！\n"
        result_text += f"📊 生成统计：成功 {success_count}/{len(prompts)} 个视频\n"
        result_text += f"⚙️ 参数设置：分辨率={resolution}, 宽高比={ratio}, 并发数={max_concurrent}\n"
        
        # 显示时长信息
        if len(durations) > 0:
            if isinstance(duration, int):
                result_text += f"⏱️ 时长：统一 {duration} 秒\n"
            else:
                result_text += f"⏱️ 时长：{durations} 秒（各镜头独立）\n"
        
        result_text += f"\n📹 生成的视频：\n"
        for i, (prompt, url, ref_img, dur) in enumerate(zip(prompts, video_urls, image_urls, durations)):
            if url:
                result_text += f"✅ 镜头{i+1}: {url}\n"
                result_text += f"   时长: {dur}秒\n"
                result_text += f"   描述: {prompt[:50]}{'...' if len(prompt) > 50 else ''}\n"
                result_text += f"   参考图: {ref_img[:40]}...\n"
            else:
                result_text += f"❌ 镜头{i+1}: 生成失败\n"
                result_text += f"   时长: {dur}秒\n"
                result_text += f"   描述: {prompt[:50]}{'...' if len(prompt) > 50 else ''}\n"
        
        if errors:
            result_text += f"\n⚠️ 错误信息：\n"
            for error in errors:
                result_text += f"   {error}\n"
        
        return result_text
        
    except Exception as e:
        return f"❌ 批量图生视频出错: {str(e)}"


@tool
def estimate_batch_generation_time(
    num_videos: int,
    duration,
    runtime,
    max_concurrent: int = None
) -> str:
    """
    估算批量视频生成所需时间
    
    参数:
        num_videos: 视频数量
        duration: 每个视频的时长（秒），可以是整数（所有视频统一时长）或列表（每个视频独立时长）
        max_concurrent: 最大并发数，默认从配置文件读取
    
    返回:
        预估时间说明
    """
    # 如果未指定并发数，从配置文件读取
    if max_concurrent is None:
        max_concurrent = BATCH_CONFIG.get('time_estimation', {}).get('default_video_concurrent', 3)
    
    # 处理 duration 参数
    if isinstance(duration, int):
        durations = [duration] * num_videos
    elif isinstance(duration, list):
        if len(duration) != num_videos:
            return f"❌ 错误：duration列表长度必须与num_videos相同！"
        durations = duration
    else:
        return f"❌ 错误：duration参数必须是整数或列表！"
    
    # 根据经验估算：每个视频生成时间约为 30-60秒 + 视频时长
    # 并发生成时，时间约为 ceil(num_videos / max_concurrent) * 单个视频时间
    
    # 使用最长视频的时长来估算
    max_duration = max(durations) if durations else 5
    single_video_time = 45 + max_duration * 2  # 单个视频预估时间（秒）
    batches = (num_videos + max_concurrent - 1) // max_concurrent
    estimated_time = batches * single_video_time
    
    minutes = int(estimated_time // 60)
    seconds = int(estimated_time % 60)
    
    # 显示时长信息
    if isinstance(duration, int):
        duration_info = f"{duration} 秒（统一时长）"
    else:
        duration_info = f"{duration} 秒（各镜头独立时长）"
    
    return f"""
⏱️ 批量视频生成时间预估

📊 生成参数：
- 视频数量：{num_videos} 个
- 视频时长：{duration_info}
- 并发数：{max_concurrent}

⏰ 预估时间：
- 单个视频预估（最长）：{single_video_time} 秒
- 批次数量：{batches} 批
- **总预估时间：{minutes}分{seconds}秒**

💡 优化建议：
- 并发数建议设置为 2-3，避免资源消耗过大
- 如果时间紧急，可以适当提高并发数（不超过5）
- 生成过程中请耐心等待，不要关闭页面

📈 实际时间可能会因服务器负载、prompt复杂度等因素有所波动。
"""
