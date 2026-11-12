# V1.3 更新日志

- 新增 `scheduleEngine.ts`：根据用户作息生成当天工作、午休预警、午休开始/结束、冲刺、下班提醒（工作日生效）。
- 新增 `SchedulePanel.vue`：网页内提醒、预览提醒、开关、本地保存、下班结算卡片。
- `SalaryDashboard.vue` 接入面板，工资仍每个整分钟刷新。
- `ActivityPanel.vue` 增加 records-change 事件以同步结算统计，**其模板与 V1.2.3 完全相同**。
- `App.vue` 保持原配置流程，仅更新页脚版本信息。
- 更新 `docs/PRD.md`：按用户要求移除带薪开会的开发范围。
- 没有增加任何 npm 第三方依赖、网络接口、后台通知或支付逻辑。
