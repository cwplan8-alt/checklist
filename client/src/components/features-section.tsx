import { Link, CheckCheck, Smartphone } from "lucide-react";

export default function FeaturesSection() {
  return (
    <div className="mt-16 grid md:grid-cols-3 gap-8">
      <div className="text-center">
        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Link className="text-primary" size={24} />
        </div>
        <h4 className="font-semibold text-slate-900 mb-2">Smart Detection</h4>
        <p className="text-slate-600 text-sm">
          Automatically finds and extracts lists from any webpage, including recipes, tutorials, and articles.
        </p>
      </div>
      <div className="text-center">
        <div className="w-12 h-12 bg-success/10 rounded-xl flex items-center justify-center mx-auto mb-4">
          <CheckCheck className="text-success" size={24} />
        </div>
        <h4 className="font-semibold text-slate-900 mb-2">Interactive Checklists</h4>
        <p className="text-slate-600 text-sm">
          Check off items as you complete them with progress tracking and visual feedback.
        </p>
      </div>
      <div className="text-center">
        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Smartphone className="text-primary" size={24} />
        </div>
        <h4 className="font-semibold text-slate-900 mb-2">Mobile Friendly</h4>
        <p className="text-slate-600 text-sm">
          Works perfectly on all devices so you can check off items wherever you are.
        </p>
      </div>
    </div>
  );
}
