import { Loader2 } from "lucide-react";

export default function LoadingState() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 mb-8">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mb-4">
          <Loader2 className="text-primary animate-spin" size={24} />
        </div>
        <h3 className="text-lg font-medium text-slate-900 mb-2">Processing your URL...</h3>
        <p className="text-slate-600">Extracting lists and converting to checklist format</p>
        <div className="mt-4 w-full bg-slate-200 rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-1000 animate-pulse" 
            style={{ width: "60%" }}
          />
        </div>
      </div>
    </div>
  );
}
