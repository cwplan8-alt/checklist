import { useState } from "react";
import Header from "@/components/header";
import UrlInputForm from "@/components/url-input-form";
import LoadingState from "@/components/loading-state";
import GeneratedChecklist from "@/components/generated-checklist";
import ErrorState from "@/components/error-state";
import FeaturesSection from "@/components/features-section";
import Footer from "@/components/footer";
import type { ChecklistWithItems } from "@shared/schema";

export default function Home() {
  const [checklist, setChecklist] = useState<ChecklistWithItems | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChecklistGenerated = (newChecklist: ChecklistWithItems) => {
    setChecklist(newChecklist);
    setError(null);
  };

  const handleLoading = (loading: boolean) => {
    setIsLoading(loading);
    if (loading) {
      setError(null);
      setChecklist(null);
    }
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setIsLoading(false);
    setChecklist(null);
  };

  const handleRetry = () => {
    setError(null);
    setChecklist(null);
  };

  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Turn Any List into a <span className="elegant-text">Checklist</span>
          </h2>
          <p className="text-lg text-slate-600 mb-8 max-w-2xl mx-auto">
            Paste a URL containing a list, and we'll automatically convert it into an interactive checklist you can check off as you go.
          </p>
        </div>

        {/* URL Input Form */}
        <div id="try-it">
          <UrlInputForm
            onChecklistGenerated={handleChecklistGenerated}
            onLoading={handleLoading}
            onError={handleError}
          />
        </div>

        {/* Loading State */}
        {isLoading && <LoadingState />}

        {/* Error State */}
        {error && <ErrorState message={error} onRetry={handleRetry} />}

        {/* Generated Checklist */}
        {checklist && <GeneratedChecklist checklist={checklist} />}

        {/* Features Section */}
        <div id="how-it-works">
          <FeaturesSection />
        </div>
      </main>

      <Footer />
    </div>
  );
}
