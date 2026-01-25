import { DesignerTab } from './types';

interface ToolbarProps {
  activeTab: DesignerTab;
  setActiveTab: (tab: DesignerTab) => void;
}

export default function Toolbar(props: ToolbarProps) {
  return (
    <div class="h-14 border-b border-white/10 flex items-center px-6 gap-6 bg-slate-950 shrink-0">
      <div class="flex items-center gap-3 mr-4">
        <h1 class="text-xl font-black italic tracking-wider">DESIGNER</h1>
        <div class="w-px h-6 bg-white/10"></div>
      </div>
      <button 
        onClick={() => props.setActiveTab('MAPS')} 
        class={`h-full border-b-2 px-2 text-sm font-bold transition-colors ${props.activeTab === 'MAPS' ? 'border-blue-500 text-white' : 'border-transparent text-white/60 hover:text-white'}`}
      >
        地图库
      </button>
      <button 
        onClick={() => props.setActiveTab('MONSTERS')} 
        class={`h-full border-b-2 px-2 text-sm font-bold transition-colors ${props.activeTab === 'MONSTERS' ? 'border-blue-500 text-white' : 'border-transparent text-white/60 hover:text-white'}`}
      >
        怪物库
      </button>
      <button 
        onClick={() => props.setActiveTab('OPERATORS')} 
        class={`h-full border-b-2 px-2 text-sm font-bold transition-colors ${props.activeTab === 'OPERATORS' ? 'border-blue-500 text-white' : 'border-transparent text-white/60 hover:text-white'}`}
      >
        干员库
      </button>
      <div class="flex-1"></div>
      <button 
        onClick={() => props.setActiveTab('JSON')} 
        class={`px-4 py-1.5 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white text-sm font-bold transition-all`}
      >
        导出 JSON
      </button>
    </div>
  );
}



