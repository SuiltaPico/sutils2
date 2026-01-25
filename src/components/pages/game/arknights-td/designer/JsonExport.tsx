interface JsonExportProps {
  exportJson: () => string;
}

export default function JsonExport(props: JsonExportProps) {
  return (
    <div class="w-full h-full max-w-5xl mx-auto p-10 flex flex-col">
      <div class="bg-slate-900 border border-white/10 rounded-lg p-4 flex flex-col flex-1 shadow-2xl">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-sm font-bold text-white/60 uppercase">Config JSON</h3>
          <button
            onClick={() => navigator.clipboard.writeText(props.exportJson())}
            class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-sm font-bold transition-colors"
          >
            复制到剪贴板
          </button>
        </div>
        <textarea
          class="flex-1 bg-black/50 border border-white/5 rounded font-mono text-xs text-green-400 outline-none resize-none p-4 leading-relaxed"
          value={props.exportJson()}
          readOnly
        />
      </div>
    </div>
  );
}



