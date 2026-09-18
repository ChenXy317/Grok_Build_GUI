import type { AppSettings } from '../../preload/index.d'

export default function SettingsModal({
  grokPath,
  settings,
  showThinking,
  yolo,
  grokPickLabel,
  onClose,
  onPickGrok,
  onShowThinking,
  onYolo,
  onPatch
}: {
  grokPath: string
  settings: AppSettings
  showThinking: boolean
  yolo: boolean
  grokPickLabel: string
  onClose: () => void
  onPickGrok: () => void
  onShowThinking: (value: boolean) => void
  onYolo: (value: boolean) => void
  onPatch: (patch: Partial<AppSettings>) => void
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-kicker">设置</div>
        <h2>Grok Build GUI</h2>
        <label className="field">
          grok 路径
          <input value={grokPath} readOnly />
        </label>
        <div className="modal-actions">
          <button className="btn" onClick={onPickGrok}>
            {grokPickLabel}
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={yolo} onChange={(e) => onYolo(e.target.checked)} />
          始终批准工具调用
        </label>
        <label className="check">
          <input type="checkbox" checked={showThinking} onChange={(e) => onShowThinking(e.target.checked)} />
          显示思考过程
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.compactUi}
            onChange={(e) => onPatch({ compactUi: e.target.checked })}
          />
          紧凑界面
        </label>
        <label className="field">
          字体大小
          <input
            type="range"
            min={0.9}
            max={1.25}
            step={0.05}
            value={settings.fontScale}
            onChange={(e) => onPatch({ fontScale: Number(e.target.value) })}
          />
        </label>
        <div className="shortcuts">
          <div className="group-label">快捷键</div>
          <p>
            <kbd>Enter</kbd> 发送　<kbd>Shift+Enter</kbd> 换行　<kbd>/</kbd> 命令
          </p>
          <p>
            <kbd>Ctrl+N</kbd> 新会话　<kbd>Ctrl+O</kbd> 打开项目　<kbd>Ctrl+B</kbd> 侧栏
          </p>
          <p>
            <kbd>Ctrl+F</kbd> 查找　<kbd>Ctrl+E</kbd> 导出　<kbd>Ctrl+,</kbd> 设置
          </p>
          <p>
            <kbd>Ctrl+L</kbd> 聚焦输入　<kbd>Esc</kbd> 停止 / 关闭
          </p>
        </div>
        <p className="hint">同一会话请不要同时在 TUI 和本 GUI 中打开。命令行可传入项目目录。</p>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
