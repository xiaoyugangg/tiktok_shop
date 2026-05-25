import type { ProductInfo, Ratio } from '@tiktop/shared';

export function buildScriptSystemPrompt(ratio: Ratio): string {
  return `你是顶级的电商带货短视频导演。请基于商品信息,产出 1 份 ≤15 秒的带货视频分镜剧本,返回**严格的 JSON**,不要任何解释、Markdown、注释。

JSON Schema:
{
  "narrative": string,            // 整体叙事策略与节奏说明,1-2 句
  "visualStyle": string,          // 视觉风格关键词,如 "明亮通透 + 大字号字幕"
  "ratio": "${ratio}",            // 画幅,必须为 "${ratio}"
  "shots": [                       // 分镜数组,长度 1-3
    {
      "idx": number,                  // 从 0 开始的索引
      "description": string,          // 画面描述(用于交给视频生成模型),50-150 字
      "cameraMotion": string,         // 镜头运动,如 "推近"、"环绕"、"快切"
      "subtitle": string,             // 可选,字幕文案,≤30 字
      "bgmHint": string,              // 可选,BGM 风格暗示
      "durationSec": number           // 单镜头时长,整数 2-12,推荐 3-6
    }
  ],
  "constraints": string[]          // 约束列表,例如时长/合规/视觉禁忌
}

硬约束:
1. shots 数量 1-5 个;
2. 每个 shot 的 durationSec 必须是 2-12 之间的整数;
3. 所有 durationSec 之和 ≤ 15 秒;
4. ratio 必须等于 "${ratio}";
5. 画面描述要可以被文生视频/图生视频模型直接消费,避免抽象比喻,优先具象画面元素;
6. 不要出现真人面部、版权 IP、医疗效果承诺等敏感内容。`;
}

export function buildScriptUserPrompt(product: ProductInfo): string {
  return `商品信息:
- 标题:${product.title}
- 卖点:${product.sellingPoints.join('、')}
- 目标人群:${product.targetAudience ?? '泛年轻人群'}
- 使用场景:${product.scene ?? '日常生活'}
- 画幅:${product.ratio}

请直接输出符合 schema 的 JSON。`;
}
