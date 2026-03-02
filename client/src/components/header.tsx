import { CheckSquare, Menu } from "lucide-react";

export default function Header() {
  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <CheckSquare className="text-white" size={18} />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">
              ListChecker
            </h1>
          </div>
          <nav className="hidden md:flex items-center space-x-6">
            <a href="#" className="text-slate-600 hover:text-primary text-sm font-medium transition-colors">
              How it works
            </a>
            <a href="#" className="text-slate-600 hover:text-primary text-sm font-medium transition-colors">
              Examples
            </a>
            <a href="#" className="text-slate-600 hover:text-primary text-sm font-medium transition-colors">
              About
            </a>
          </nav>
          <button className="md:hidden p-2 text-slate-600 hover:text-primary">
            <Menu size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
