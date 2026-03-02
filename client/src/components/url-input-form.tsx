import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { apiRequest } from "@/lib/queryClient";
import { urlInputSchema, type UrlInput, type ChecklistWithItems } from "@shared/schema";

interface UrlInputFormProps {
  onChecklistGenerated: (checklist: ChecklistWithItems) => void;
  onLoading: (loading: boolean) => void;
  onError: (error: string) => void;
}

const EXAMPLE_URLS = [
  "https://screencrush.com/new-york-times-best-films-21st-century/",
  "https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/",
  "https://www.wikihow.com/Make-Pancakes"
];

export default function UrlInputForm({ onChecklistGenerated, onLoading, onError }: UrlInputFormProps) {
  const [showExamples, setShowExamples] = useState(false);

  const form = useForm<UrlInput>({
    resolver: zodResolver(urlInputSchema),
    defaultValues: {
      url: "",
    },
  });

  const processUrlMutation = useMutation({
    mutationFn: async (data: UrlInput) => {
      const response = await apiRequest("POST", "/api/process-url", data);
      return response.json() as Promise<ChecklistWithItems>;
    },
    onMutate: () => {
      onLoading(true);
    },
    onSuccess: (checklist) => {
      onChecklistGenerated(checklist);
      onLoading(false);
    },
    onError: (error: Error) => {
      onError(error.message);
      onLoading(false);
    },
  });

  const handleSubmit = (data: UrlInput) => {
    processUrlMutation.mutate(data);
  };

  const handleClearInput = () => {
    form.setValue("url", "");
  };

  const handleExampleClick = (url: string) => {
    form.setValue("url", url);
    setShowExamples(false);
  };

  const toggleExamples = () => {
    setShowExamples(!showExamples);
  };

  return (
    <div className="elegant-card rounded-xl p-6 mb-8">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="url"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="block text-sm font-medium text-slate-700 mb-2">
                  Paste your URL here
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      {...field}
                      type="url"
                      placeholder="https://example.com/best-recipes-2025"
                      className="elegant-input w-full px-4 py-3 rounded-lg text-base placeholder:text-slate-400 pr-10"
                    />
                    {field.value && (
                      <button
                        type="button"
                        onClick={handleClearInput}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </FormControl>
                <p className="text-xs text-slate-500">
                  Supports articles, recipes, tutorials, and most web pages with lists
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <div className="flex flex-col sm:flex-row gap-3">
            <Button 
              type="submit" 
              disabled={processUrlMutation.isPending}
              className="elegant-button flex-1 px-6 py-3 rounded-lg font-medium"
            >
              <Wand2 className="mr-2" size={16} />
              {processUrlMutation.isPending ? "Processing..." : "Generate Checklist"}
            </Button>
            <Button 
              type="button" 
              variant="outline"
              onClick={toggleExamples}
              className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
            >
              Try Example
            </Button>
          </div>
        </form>
      </Form>

      {showExamples && (
        <div className="mt-4 p-4 bg-slate-50 rounded-lg">
          <h4 className="text-sm font-medium text-slate-700 mb-2">Example URLs:</h4>
          <div className="space-y-2">
            {EXAMPLE_URLS.map((url, index) => (
              <button
                key={index}
                onClick={() => handleExampleClick(url)}
                className="block w-full text-left text-sm text-primary hover:text-purple-700 transition-colors p-2 rounded hover:bg-white"
              >
                {url}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
