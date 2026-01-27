export type TtsSpeaker = { id: string; name: string }

export const TTS_SPEAKERS: TtsSpeaker[] = [
  { id: "zh_female_xiaohe_uranus_bigtts", name: "小河" },
  { id: "zh_female_vv_uranus_bigtts", name: "Vivi" },
  { id: "zh_male_m191_uranus_bigtts", name: "云洲" },
  { id: "zh_male_taocheng_uranus_bigtts", name: "小天" },
  { id: "zh_female_xueayi_saturn_bigtts", name: "雪姨" },
  { id: "zh_male_dayi_saturn_bigtts", name: "大意" },
  { id: "zh_female_mizai_saturn_bigtts", name: "米在" },
  { id: "zh_female_jitangnv_saturn_bigtts", name: "鸡汤女" },
  { id: "zh_female_meilinvyou_saturn_bigtts", name: "甜美女友" },
  { id: "zh_female_santongyongns_saturn_bigtts", name: "三通" },
  { id: "zh_male_ruyayichen_saturn_bigtts", name: "优雅男士" },
  { id: "saturn_zh_female_keainvsheng_tob", name: "可爱女生" },
  { id: "saturn_zh_female_tiaopigongzhu_tob", name: "调皮公主" },
  { id: "saturn_zh_male_shuanglangshaonian_tob", name: "爽朗少年" },
  { id: "saturn_zh_male_tiancaitongzhuo_tob", name: "天才同桌" },
  { id: "saturn_zh_female_cancan_tob", name: "婉婉" }
]

export const DEFAULT_TTS_TEST_TEXT = "你好！我是蜜糖"

export function getSpeakerName(speakerId: string): string | null {
  const hit = TTS_SPEAKERS.find((s) => s.id === speakerId)
  return hit?.name ?? null
}

