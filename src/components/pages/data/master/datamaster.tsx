import { A } from "@solidjs/router";

export default function DataMasterHome() {
  return (
    <div style="padding: 24px; max-width: 960px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 700;">DataMaster</h1>
      <div style="opacity: 0.9;">一个面向开发者与数据专业人士的统一数据处理工作台 · JSON 版</div>

      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="font-weight: 600;">快速开始</div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <A href="/datamaster/json" style="padding: 10px 12px; border: 1px solid #e5e5e5; border-radius: 10px; background: #fbfbfb; text-decoration: none;">JSON 工具集</A>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="font-weight: 600;">阶段一 · 目标</div>
        <ul style="margin: 0 0 0 16px; padding: 0;">
          <li>实时格式化与校验，优秀错误定位</li>
          <li>编辑器增强与拖拽/打开文件</li>
          <li>JSONPath 查询（下一步）</li>
          <li>Tree 视图与 YAML 转换（下一步）</li>
        </ul>
      </div>
    </div>
  );
}
