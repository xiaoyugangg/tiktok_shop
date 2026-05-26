# 已知问题记录

## Seedance 1.5 Pro i2v duration 偶发 400

- 记录日期：2026-05-26
- 现象：生成分镜视频时，Seedance 创建任务可能返回 400。
- 典型错误：

```text
seedance create task failed: 400 {"error":{"code":"InvalidParameter","message":"the parameter duration specified in the request is not valid for model doubao-seedance-1-5-pro in i2v ..."}}
```

- 当前原因判断：系统会把脚本/分镜中的 `durationSec` 传给 Seedance。当前代码只做了 `2-12` 秒范围裁剪，但线上 `doubao-seedance-1-5-pro` 的 i2v 调用对 `duration` 的实际校验可能更严格。Retry Agent 识别到 duration 错误后会把时长修正为 5 秒，因此自动重试通常可以成功。
- 当前决策：暂不修改生成逻辑，先保留 retry 兜底。
- 后续可选修复：在首次请求前对 Seedance 1.5 Pro i2v 统一使用 5 秒，或者引入模型能力配置表，按模型/模式约束合法 `duration`。
