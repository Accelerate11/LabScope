import type { SourceId } from '../workspace/message-bus';
export interface PlotSeriesConfig {
  id: string; source: SourceId; topic: string; field: string; displayName: string; color: string; unit: string;
  visible: boolean; capacity: number;
}
export interface PlotConfig { series: PlotSeriesConfig[]; windowSeconds: number; maxPoints: number; }
export const plotColors = ['#52c0f1','#40e7b2','#ffbe66','#e879f9','#fb7185','#a3e635'];
export const defaultPlotConfig: PlotConfig = { series: [], windowSeconds: 30, maxPoints: 2000 };
