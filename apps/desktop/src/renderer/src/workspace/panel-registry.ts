import type { ComponentType } from 'react';
import type { MessageEnvelope, SourceId } from './message-bus';
import type { PointCloudConfig } from '../pointcloud/config';
import type { PlotConfig } from '../plot/plot-types';

export interface PanelConfig {
  id: string;
  type: string;
  source: SourceId;
  topic: string | null;
  title?: string;
  pointCloud?: PointCloudConfig;
  plot?: PlotConfig;
}

export type PanelConfigPatch = Partial<Pick<PanelConfig, 'source' | 'topic' | 'title' | 'pointCloud' | 'plot'>>;

export interface PanelViewProps {
  config: PanelConfig;
  message: MessageEnvelope | undefined;
  update?: (patch: PanelConfigPatch) => void;
}

export interface PanelDefinition {
  type: string;
  label: string;
  accepts(schemaName: string): boolean;
  managesSubscriptions?: boolean;
  View: ComponentType<PanelViewProps>;
}

export class PanelRegistry {
  private readonly definitions = new Map<string, PanelDefinition>();
  private readonly listeners = new Set<() => void>();
  private snapshot: readonly PanelDefinition[] = [];

  get(type: string): PanelDefinition | undefined {
    return this.definitions.get(type);
  }

  getSnapshot = (): readonly PanelDefinition[] => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  register(definition: PanelDefinition): () => void {
    if (!/^[a-zA-Z][a-zA-Z0-9-]{0,63}$/.test(definition.type) || !definition.label.trim()) {
      throw new Error('Panel type and label are required');
    }
    if (this.definitions.has(definition.type)) throw new Error('Panel already registered: ' + definition.type);
    this.definitions.set(definition.type, definition);
    this.publish();
    return () => {
      if (this.get(definition.type) === definition) this.unregister(definition.type);
    };
  }

  unregister(type: string): void {
    if (this.definitions.delete(type)) this.publish();
  }

  private publish(): void {
    this.snapshot = [...this.definitions.values()];
    for (const listener of [...this.listeners]) listener();
  }
}
