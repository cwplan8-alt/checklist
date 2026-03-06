import { useState } from "react";
import { CheckSquare, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Try it", href: "/#try-it" },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <a href="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <CheckSquare className="text-white" size={18} />
            </div>
            <span className="text-xl font-semibold text-slate-900">ListChecker</span>
          </a>

          <nav className="hidden md:flex items-center space-x-6">
            {NAV_LINKS.map(link => (
              <a
                key={link.href}
                href={link.href}
                className="text-slate-600 hover:text-primary text-sm font-medium transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <button
            className="md:hidden p-2 text-slate-600 hover:text-primary"
            onClick={() => setMobileOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-slate-100 bg-white px-4 py-3 space-y-1">
          {NAV_LINKS.map(link => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
