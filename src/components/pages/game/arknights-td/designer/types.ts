import { WaveEvent, LevelConfig } from '../types';

export interface EditorWaveEvent extends WaveEvent {}

export interface EditorConfig {
  id?: string | number;
  code: string;
  name: string;
  description: string;
  totalEnemies: number;
  initialDp: number;
  maxLife: number;
  mapWidth: number;
  mapHeight: number;
  entryPattern?: string;
  exitPattern?: string;
}

export type DesignerTab = 'MAPS' | 'JSON' | 'MONSTERS' | 'OPERATORS';

export interface Tool {
  id: number;
  name: string;
  color: string;
  border: string;
  icon?: string;
}

