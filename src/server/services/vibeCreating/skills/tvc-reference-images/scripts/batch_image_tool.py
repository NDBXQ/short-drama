"""
批量图片生成工具
支持并发生成多个图片，提升多场景视觉创作效率
"""
import asyncio
import os
import time
import yaml
from langchain.tools import tool
from coze_coding_dev_sdk import ImageGenerationClient
from coze_coding_utils.runtime_ctx.context import new_context


# 加载批量生成配置
def load_batch_config():
    """加载YAML配置文件（每次调用时重新读取，确保配置更新生效）"""
    workspace_path = os.getenv("COZE_WORKSPACE_PATH", "/workspace/projects")
    config_path = os.path.join(workspace_path, "config/batch_config.yaml")
    
    if not os.path.exists(config_path):
        # 如果配置文件不存在，使用默认值
        return {
            'image_generation': {
                'max_concurrent': 3,
                'max_concurrent_from_ref': 3
            },
            'time_estimation': {
                'default_image_concurrent': 3
            }
        }
    
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
        return config
    except Exception:
        # 读取失败时使用默认值
        return {
            'image_generation': {
                'max_concurrent': 3,
                'max_concurrent_from_ref': 3
            },
            'time_estimation': {
                'default_image_concurrent': 3
            }
        }


# 全局配置缓存（模块加载时初始化）
BATCH_CONFIG = load_batch_config()


def is_rate_limit_error(error_str: str) -> bool:
    """识别是否为限流错误"""
    if not error_str:
        return False
    error_lower = error_str.lower()
    return (
        "403" in error_lower or
        "forbidden" in error_lower or
        "rate limit" in error_lower or
        "too many requests" in error_lower or
        "限流" in error_str
    )


async def retry_with_backoff(
    func,
    *args,
    index: int = 0,
    max_attempts: int = 3,
    initial_delay: float = 2.0,
    backoff_factor: float = 2.0,
    **kwargs
):
    """
    带指数退避的异步重试机制
    
    参数:
        func: 异步函数
        *args: 函数参数
        index: 任务索引（用于日志输出）
        max_attempts: 最大重试次数
        initial_delay: 初始延迟时间（秒）
        backoff_factor: 退避系数
        **kwargs: 函数关键字参数
    
    返回:
        (index, result, error) 元组
    """
    last_error = None
    
    for attempt in range(max_attempts):
        try:
            result = await func(*args, **kwargs)
            # 如果成功返回，立即返回结果
            return index, result, None
        except Exception as e:
            last_error = str(e)
            error_str = last_error.lower()
            
            # 检查是否为限流错误
            if not is_rate_limit_error(last_error):
                # 非限流错误，立即返回，不重试
                return index, None, last_error
            
            # 限流错误，进行重试
            if attempt < max_attempts - 1:
                # 计算延迟时间：初始延迟 × 退避系数 ^ 重试次数
                delay = initial_delay * (backoff_factor ** attempt)
                # 增加随机抖动（±20%），避免同时重试造成雷群效应
                import random
                jitter = delay * 0.2 * (random.random() * 2 - 1)
                actual_delay = delay + jitter
                
                # 等待后重试
                await asyncio.sleep(actual_delay)
            else:
                # 达到最大重试次数，返回错误
                return index, None, f"重试 {max_attempts} 次后失败: {last_error}"
    
    return index, None, last_error


@tool
def generate_images_batch(
    prompts: list,
    runtime,
    size: str = "2K",
    watermark: bool = False,
    max_concurrent: int = None
) -> str:
    """
    批量并发生成多个图片（文生图）
    
    参数:
        prompts: 图片描述列表，每个元素是一个字符串，描述一个场景的图片内容
                 例如：["一个跑酷少年在城市高楼间飞跃", "少年落地后喘息，汗水滑落", "少年拿起饮料仰头喝下"]
        size: 图像尺寸，可选值: "2K", "4K", 或 "WIDTHxHEIGHT"（如 "3840x2160"）
        watermark: 是否添加水印，默认为 False
        max_concurrent: 最大并发数，默认从配置文件读取（建议2-5，避免资源消耗过大）
    
    返回:
        所有生成的图片URL列表，按输入顺序返回
    """
    # 如果未指定并发数，从配置文件读取
    if max_concurrent is None:
        max_concurrent = BATCH_CONFIG.get('image_generation', {}).get('max_concurrent', 3)
    
    # 读取重试配置
    retry_config = BATCH_CONFIG.get('retry', {})
    retry_enabled = retry_config.get('enabled', True)
    max_attempts = retry_config.get('max_attempts', 3)
    initial_delay = retry_config.get('initial_delay', 2.0)
    backoff_factor = retry_config.get('backoff_factor', 2.0)
    
    ctx = runtime.context
    image_ctx = new_context(method="image.batch.generate")
    
    client = ImageGenerationClient(ctx=image_ctx)
    
    async def generate_with_limit(prompts_list, limit):
        """带并发限制的批量生成"""
        semaphore = asyncio.Semaphore(limit)
        
        async def generate_single(prompt, index):
            async with semaphore:
                async def do_generate():
                    response = await client.generate_async(
                        prompt=prompt,
                        size=size,
                        watermark=watermark
                    )
                    if response.success:
                        return response.image_urls[0]
                    else:
                        raise Exception(str(response.error_messages))
                
                if retry_enabled:
                    # 使用重试机制
                    result_index, image_url, error = await retry_with_backoff(
                        do_generate,
                        index=index,
                        max_attempts=max_attempts,
                        initial_delay=initial_delay,
                        backoff_factor=backoff_factor
                    )
                    return result_index, image_url, error
                else:
                    # 不使用重试机制
                    try:
                        response = await client.generate_async(
                            prompt=prompt,
                            size=size,
                            watermark=watermark
                        )
                        if response.success:
                            return index, response.image_urls[0], None
                        else:
                            return index, None, str(response.error_messages)
                    except Exception as e:
                        return index, None, str(e)
        
        tasks = [generate_single(prompt, i) for i, prompt in enumerate(prompts_list)]
        return await asyncio.gather(*tasks)
    
    try:
        # 运行并发生成
        results = asyncio.run(generate_with_limit(prompts, max_concurrent))
        
        # 整理结果
        image_urls = [None] * len(prompts)
        errors = []
        retry_count = 0
        
        for index, image_url, error in results:
            if image_url:
                image_urls[index] = image_url
                # 检查错误信息中是否包含重试标记
                if error and "重试" in error:
                    retry_count += 1
            else:
                errors.append(f"图片{index + 1}生成失败: {error}")
        
        # 生成结果报告
        success_count = sum(1 for url in image_urls if url is not None)
        
        result_text = f"🎨 批量图片生成完成！\n"
        result_text += f"📊 生成统计：成功 {success_count}/{len(prompts)} 张图片\n"
        result_text += f"⚙️ 参数设置：尺寸={size}, 水印={watermark}, 并发数={max_concurrent}\n"
        
        # 添加重试统计
        if retry_enabled:
            result_text += f"🔄 重试机制：已启用（最大重试 {max_attempts} 次）\n"
            if retry_count > 0:
                result_text += f"📈 重试统计：{retry_count} 张图片通过重试成功生成\n"
        else:
            result_text += f"🔄 重试机制：已禁用\n"
        
        result_text += f"\n🖼️ 生成的图片：\n"
        for i, (prompt, url) in enumerate(zip(prompts, image_urls)):
            if url:
                result_text += f"✅ 图片{i+1}: {url}\n"
                result_text += f"   描述: {prompt[:60]}{'...' if len(prompt) > 60 else ''}\n"
            else:
                result_text += f"❌ 图片{i+1}: 生成失败\n"
                result_text += f"   描述: {prompt[:60]}{'...' if len(prompt) > 60 else ''}\n"
        
        if errors:
            result_text += f"\n⚠️ 错误信息：\n"
            for error in errors:
                result_text += f"   {error}\n"
        
        return result_text
        
    except Exception as e:
        return f"❌ 批量图片生成出错: {str(e)}"


@tool
def generate_images_from_references_batch(
    prompts: list,
    reference_image_urls: list,
    runtime,
    size: str = "2K",
    watermark: bool = False,
    max_concurrent: int = None
) -> str:
    """
    批量并发生成多个图片（图生图）
    
    参数:
        prompts: 新图片的描述列表，每个元素是一个字符串，说明如何修改参考图像
        reference_image_urls: 参考图片URL列表，长度必须与prompts相同
        size: 图像尺寸，可选值: "2K", "4K", 或 "WIDTHxHEIGHT"（如 "3840x2160"）
        watermark: 是否添加水印，默认为 False
        max_concurrent: 最大并发数，默认从配置文件读取（建议2-5，避免资源消耗过大）
    
    返回:
        所有生成的图片URL列表，按输入顺序返回
    """
    # 如果未指定并发数，从配置文件读取
    if max_concurrent is None:
        max_concurrent = BATCH_CONFIG.get('image_generation', {}).get('max_concurrent_from_ref', 3)
    
    # 读取重试配置
    retry_config = BATCH_CONFIG.get('retry', {})
    retry_enabled = retry_config.get('enabled', True)
    max_attempts = retry_config.get('max_attempts', 3)
    initial_delay = retry_config.get('initial_delay', 2.0)
    backoff_factor = retry_config.get('backoff_factor', 2.0)
    
    if len(prompts) != len(reference_image_urls):
        return f"❌ 错误：prompts和reference_image_urls的长度必须相同！当前：prompts={len(prompts)}, reference_image_urls={len(reference_image_urls)}"
    
    ctx = runtime.context
    image_ctx = new_context(method="image.batch.generate.from_references")
    
    client = ImageGenerationClient(ctx=image_ctx)
    
    async def generate_with_limit(prompts_list, reference_urls_list, limit):
        """带并发限制的批量生成"""
        semaphore = asyncio.Semaphore(limit)
        
        async def generate_single(prompt, reference_url, index):
            async with semaphore:
                async def do_generate():
                    response = await client.generate_async(
                        prompt=prompt,
                        image=reference_url,
                        size=size,
                        watermark=watermark
                    )
                    if response.success:
                        return response.image_urls[0]
                    else:
                        raise Exception(str(response.error_messages))
                
                if retry_enabled:
                    # 使用重试机制
                    result_index, image_url, error = await retry_with_backoff(
                        do_generate,
                        index=index,
                        max_attempts=max_attempts,
                        initial_delay=initial_delay,
                        backoff_factor=backoff_factor
                    )
                    return result_index, image_url, error
                else:
                    # 不使用重试机制
                    try:
                        response = await client.generate_async(
                            prompt=prompt,
                            image=reference_url,
                            size=size,
                            watermark=watermark
                        )
                        if response.success:
                            return index, response.image_urls[0], None
                        else:
                            return index, None, str(response.error_messages)
                    except Exception as e:
                        return index, None, str(e)
        
        tasks = [
            generate_single(prompts_list[i], reference_urls_list[i], i)
            for i in range(len(prompts_list))
        ]
        return await asyncio.gather(*tasks)
    
    try:
        # 运行并发生成
        results = asyncio.run(generate_with_limit(prompts, reference_image_urls, max_concurrent))
        
        # 整理结果
        image_urls = [None] * len(prompts)
        errors = []
        retry_count = 0
        
        for index, image_url, error in results:
            if image_url:
                image_urls[index] = image_url
                # 检查错误信息中是否包含重试标记
                if error and "重试" in error:
                    retry_count += 1
            else:
                errors.append(f"图片{index + 1}生成失败: {error}")
        
        # 生成结果报告
        success_count = sum(1 for url in image_urls if url is not None)
        
        result_text = f"🎨 批量图生图完成！\n"
        result_text += f"📊 生成统计：成功 {success_count}/{len(prompts)} 张图片\n"
        result_text += f"⚙️ 参数设置：尺寸={size}, 水印={watermark}, 并发数={max_concurrent}\n"
        
        # 添加重试统计
        if retry_enabled:
            result_text += f"🔄 重试机制：已启用（最大重试 {max_attempts} 次）\n"
            if retry_count > 0:
                result_text += f"📈 重试统计：{retry_count} 张图片通过重试成功生成\n"
        else:
            result_text += f"🔄 重试机制：已禁用\n"
        
        result_text += f"\n🖼️ 生成的图片：\n"
        for i, (prompt, url, ref_img) in enumerate(zip(prompts, image_urls, reference_image_urls)):
            if url:
                result_text += f"✅ 图片{i+1}: {url}\n"
                result_text += f"   描述: {prompt[:50]}{'...' if len(prompt) > 50 else ''}\n"
                result_text += f"   参考图: {ref_img[:40]}...\n"
            else:
                result_text += f"❌ 图片{i+1}: 生成失败\n"
                result_text += f"   描述: {prompt[:50]}{'...' if len(prompt) > 50 else ''}\n"
        
        if errors:
            result_text += f"\n⚠️ 错误信息：\n"
            for error in errors:
                result_text += f"   {error}\n"
        
        return result_text
        
    except Exception as e:
        return f"❌ 批量图生图出错: {str(e)}"


@tool
def estimate_batch_image_generation_time(
    num_images: int,
    runtime,
    max_concurrent: int = None
) -> str:
    """
    估算批量图片生成所需时间
    
    参数:
        num_images: 图片数量
        max_concurrent: 最大并发数，默认从配置文件读取
    
    返回:
        预估时间说明
    """
    # 如果未指定并发数，从配置文件读取
    if max_concurrent is None:
        max_concurrent = BATCH_CONFIG.get('time_estimation', {}).get('default_image_concurrent', 3)
    
    # 根据经验估算：每个图片生成时间约为 20-40秒
    # 并发生成时，时间约为 ceil(num_images / max_concurrent) * 单个图片时间
    
    single_image_time = 30  # 单个图片预估时间（秒）
    batches = (num_images + max_concurrent - 1) // max_concurrent
    estimated_time = batches * single_image_time
    
    minutes = int(estimated_time // 60)
    seconds = int(estimated_time % 60)
    
    return f"""
⏱️ 批量图片生成时间预估

📊 生成参数：
- 图片数量：{num_images} 张
- 并发数：{max_concurrent}

⏰ 预估时间：
- 单个图片预估：{single_image_time} 秒
- 批次数量：{batches} 批
- **总预估时间：{minutes}分{seconds}秒**

💡 优化建议：
- 并发数建议设置为 2-5，避免资源消耗过大
- 如果时间紧急，可以适当提高并发数（不超过8）
- 生成过程中请耐心等待，不要关闭页面

📈 实际时间可能会因服务器负载、prompt复杂度等因素有所波动。
"""
