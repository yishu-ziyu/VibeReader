# uni-rag 项目开发守则

新 agent 接入请先读 `AGENT_ONBOARDING.md`。

## 用 yishuship 跟进想法（只在用户输入命令时）

- `/yishuship:idea <一句话>`：新功能或新想法。先把它变成用户能看到、能做的具体行为，等用户决定做不做。
- `/yishuship:next`：继续这个项目里正在做的想法。
- `/yishuship:ideas`：看所有项目里还活着的想法。

每个想法的进度在 `.ship/ideas/<名字>.md`。`.ship/tasks/` 是旧版 yishuship 留下的记录，只读，不再写入。

用户没有输入这些命令时，不要自动套用任何流程，直接完成请求。
