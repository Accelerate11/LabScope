import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export class PanelErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error('面板运行失败', error);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex items-center gap-2 p-3 text-xs text-danger">
        <span>面板运行失败。</span>
        <button type="button" className="focus-ring rounded border border-border px-2 py-1"
          onClick={() => this.setState({ failed: false })}>
          重试
        </button>
      </div>
    );
  }
}
