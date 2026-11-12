# 产品开发记录 — V1.2

- 基准：PRD V1.0 第二版、V1.1.1 每分钟更新版本。
- 新增：厕所、摸鱼、学习的开始/结束/趣味弹窗/记录/本地备份。
- 新增：`src/components/ActivityPanel.vue`、`src/utils/activityEngine.ts`。
- 更新：`src/components/SalaryDashboard.vue`（接入活动模块与工作状态）、`src/App.vue`（底部版本显示）。
- 未修改：`src/utils/salaryEngine.ts`（随包附带原版，保证结算使用完全相同的基本工资计算逻辑）。
- 数据兼容：原工资设置 Key 不变；活动使用独立 `paid-fishing:activities:v1`。
- 核验重点：午休/下班自动截止、精确到秒结算、状态切换、手机布局、隐私和多次点击防重复保存。
