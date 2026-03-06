import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { CheckSquare } from "lucide-react";
import GeneratedChecklist from "@/components/generated-checklist";
import type { ChecklistWithItems } from "@shared/schema";

export default function SharedChecklist() {
  const { token } = useParams<{ token: string }>();
  const [checklist, setChecklist] = useState<ChecklistWithItems | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then(r => r.ok ? r.json() : r.json().then((d: any) => Promise.reject(d.message)))
      .then(setChecklist)
      .catch((msg: string) => setError(msg ?? "Checklist not found"));
  }, [token]);

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-3 py-4">
            <a href="/" className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <CheckSquare className="text-white" size={18} />
              </div>
              <span className="text-xl font-semibold text-slate-900">ListChecker</span>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {!checklist && !error && (
          <div className="text-center text-slate-500 py-16">Loading checklist…</div>
        )}
        {error && (
          <div className="text-center py-16">
            <p className="text-slate-700 font-medium mb-2">Checklist not found</p>
            <p className="text-slate-500 text-sm mb-6">{error}</p>
            <a href="/" className="text-primary hover:underline text-sm">
              Create your own checklist →
            </a>
          </div>
        )}
        {checklist && <GeneratedChecklist checklist={checklist} />}
      </main>
    </div>
  );
}
