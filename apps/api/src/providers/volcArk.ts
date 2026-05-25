import { type ProductInfo, type Script, ScriptSchema } from '@tiktop/shared';
import OpenAI from 'openai';

import { env } from '../env';
import { logger } from '../lib/logger';
import { buildScriptSystemPrompt, buildScriptUserPrompt } from '../modules/script/prompts';

const liveClient =
  env.MODEL_MODE === 'live'
    ? new OpenAI({
        apiKey: env.ARK_API_KEY ?? 'missing-key',
        baseURL: env.ARK_BASE_URL,
      })
    : null;

export interface GenerateScriptInput {
  product: ProductInfo;
}

export async function generateScript(input: GenerateScriptInput): Promise<Script> {
  if (env.MODEL_MODE === 'mock' || !liveClient || !env.ARK_TEXT_MODEL) {
    logger.info({ mode: env.MODEL_MODE }, 'using mock script generator');
    return mockScript(input.product);
  }

  const systemPrompt = buildScriptSystemPrompt(input.product.ratio);
  const userPrompt = buildScriptUserPrompt(input.product);

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const resp = await liveClient.chat.completions.create({
        model: env.ARK_TEXT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
          ...(attempt > 0 && lastError instanceof Error
            ? [
                {
                  role: 'user' as const,
                  content: `上一次返回不合法 (${lastError.message})，请严格按 JSON Schema 重新输出。`,
                },
              ]
            : []),
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });
      const raw = resp.choices[0]?.message?.content;
      if (!raw) throw new Error('empty model response');
      const json = JSON.parse(raw);
      const parsed = ScriptSchema.parse(json);
      return parsed;
    } catch (err) {
      lastError = err;
      logger.warn({ err, attempt }, 'script generation attempt failed');
    }
  }
  throw new Error(
    `script generation failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

function mockScript(product: ProductInfo): Script {
  const points = product.sellingPoints.slice(0, 3);
  const ratio = product.ratio;
  const shots = [
    {
      idx: 0,
      description: `特写镜头展示「${product.title}」的核心质感与外观,光线明亮、背景简洁。`,
      cameraMotion: '推近 + 轻微环绕',
      subtitle: product.title,
      bgmHint: '轻快流行',
      durationSec: 4,
    },
    {
      idx: 1,
      description: `生活化场景中使用「${product.title}」,突出 ${points[0] ?? '使用体验'}。`,
      cameraMotion: '中景跟随',
      subtitle: points[0] ?? '',
      bgmHint: '节奏渐强',
      durationSec: 5,
    },
    {
      idx: 2,
      description: `多角度产品镜头叠加卖点字幕:${points.slice(1).join('、') || '高品质 / 高性价比'}。`,
      cameraMotion: '快速切换 + 旋转',
      subtitle: '立即下单',
      bgmHint: '高潮收尾',
      durationSec: 4,
    },
  ];
  return ScriptSchema.parse({
    narrative: `围绕「${product.title}」展开 3 段式带货叙事:吸引注意 → 场景共鸣 → 行动召唤。`,
    visualStyle: '明亮通透、产品居中、字幕大字号高对比',
    ratio,
    shots,
    constraints: ['总时长不超过 15 秒', '画面不出现真人面部', '字幕语言:中文简体', `画幅:${ratio}`],
  });
}
