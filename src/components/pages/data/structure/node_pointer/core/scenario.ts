import { IDataStructure, StepAction } from './types';

export interface ScenarioResult {
    structureName: string;
    totalSteps: number;
    timeElapsed: number; // ms
    comparisons: number; // 比较次数
    memoryUsage: number; // 模拟的内存占用
    success: boolean;
    logs: string[];
}

export interface IStage {
    id: string;
    title: string;
    run(structure: IDataStructure): Generator<StepAction, void, void>;
}

export interface IScenario {
    id: string;
    title: string;
    description: string;
    painPoint: string; // 痛点描述
    
    // 获取场景的所有阶段
    getStages(): IStage[];
}
