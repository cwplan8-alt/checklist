import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6 mb-8">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <AlertCircle className="text-error" size={24} />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-medium text-slate-900 mb-2">Unable to Process URL</h3>
          <p className="text-slate-600 mb-4">
            {message}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              onClick={onRetry}
              className="bg-primary text-white hover:bg-blue-700"
            >
              Try Again
            </Button>
            <Button 
              variant="ghost"
              className="text-slate-600 hover:text-slate-900"
            >
              View Examples
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
