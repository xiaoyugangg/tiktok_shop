# 已知问题记录

## Seedance 1.5 Pro i2v duration 偶发 400

- 记录日期：2026-05-26
- 现象：生成分镜视频时，Seedance 创建任务可能返回 400。
- 典型错误：

```text
seedance create task failed: 400 {"error":{"code":"InvalidParameter","message":"the parameter duration specified in the request is not valid for model doubao-seedance-1-5-pro in i2v ..."}}
```

- 当前原因判断：系统会把脚本/分镜中的 `durationSec` 传给 Seedance。线上 `doubao-seedance-1-5-pro` 的 i2v 调用只接受更严格的时长范围，3 秒等短分镜会被直接驳回。
- 当前修复：脚本、分镜编辑、Python Seedance provider 都已统一约束为 `4-12` 秒；Retry Agent 识别到 duration 错误后会把时长修正为 5 秒再重试。
- 后续可选增强：引入模型能力配置表，按模型/模式维护合法 `duration`、画幅和输入类型，避免约束散落在多处代码中。

## 智能分镜方案生成偶发超时

- 记录日期：2026-05-28
- 现象：生成智能分镜方案时，外部 LLM 或 embedding API 偶发超过前后端默认等待时间。
- 当前修复：Node 调用 `/editing/plan` 的超时时间已延长；Python Editing Graph 对 LLM 超时加入 fallback，会记录 `editing.llm.timeout_fallback` trace，并返回基于脚本和 RAG 素材的可执行分镜方案。
- 后续可选增强：把智能分镜方案改为异步任务，前端通过轮询或 SSE 查看计划生成进度。

## 分镜素材重复选择

- 记录日期：2026-05-28
- 现象：多个分镜可能选择同一张素材。技术上可用，但视觉上会显得重复。
- 当前修复：Editing Graph 在校验 LLM 结果时会尽量为不同分镜选择未使用过的 RAG 候选素材；如果素材数量不足或语义不匹配，则允许 `sourceMaterialId` 为空，回退到纯文本生成，避免硬塞不合适的图片。
- 后续可选增强：前端展示“素材覆盖率”和“重复素材提示”，让用户在生成前手动调整。
