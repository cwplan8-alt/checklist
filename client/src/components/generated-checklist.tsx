import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { RotateCcw, Download, Share2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import type { ChecklistWithItems, ChecklistItem } from "@shared/schema";

interface GeneratedChecklistProps {
  checklist: ChecklistWithItems;
}

export default function GeneratedChecklist({ checklist: initialChecklist }: GeneratedChecklistProps) {
  const [checklist, setChecklist] = useState(initialChecklist);

  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, isCompleted }: { itemId: number; isCompleted: boolean }) => {
      await apiRequest("PATCH", `/api/checklist-items/${itemId}`, { isCompleted });
    },
  });

  const handleCheckboxChange = (itemId: number, checked: boolean) => {
    setChecklist(prev => ({
      ...prev,
      items: prev.items.map(item =>
        item.id === itemId ? { ...item, isCompleted: checked } : item
      ),
      completedItems: checked
        ? prev.completedItems + 1
        : Math.max(0, prev.completedItems - 1)
    }));

    updateItemMutation.mutate({ itemId, isCompleted: checked });
  };

  const handleResetAll = () => {
    setChecklist(prev => ({
      ...prev,
      items: prev.items.map(item => ({ ...item, isCompleted: false })),
      completedItems: 0
    }));

    checklist.items.forEach(item => {
      if (item.isCompleted) {
        updateItemMutation.mutate({ itemId: item.id, isCompleted: false });
      }
    });
  };

  const handleExport = () => {
    const lines = [
      checklist.title,
      `Source: ${checklist.sourceUrl}`,
      "",
      ...checklist.items.map(item =>
        `[${item.isCompleted ? "x" : " "}] ${item.text}`
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${checklist.title.replace(/[^a-z0-9]/gi, "_").slice(0, 50)}_checklist.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: checklist.title, url });
      } catch {
        // user cancelled
      }
    } else {
      await navigator.clipboard.writeText(url);
    }
  };

  const progressPercentage = checklist.totalItems > 0
    ? (checklist.completedItems / checklist.totalItems) * 100
    : 0;

  return (
    <div className="elegant-card rounded-xl p-4 sm:p-6">
      <div className="flex items-start justify-between mb-6 gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-slate-900 truncate">{checklist.title}</h3>
          <p className="text-sm text-slate-600 mt-1 truncate">
            From: <span className="text-primary font-medium">{checklist.sourceUrl}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-slate-600 whitespace-nowrap">
            <span className="font-medium text-success">{checklist.completedItems}</span>
            {" / "}
            <span>{checklist.totalItems}</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetAll}
            className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
            title="Reset all"
          >
            <RotateCcw size={16} />
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-200 rounded-full h-2 mb-6">
        <div
          className="bg-primary h-2 rounded-full transition-all duration-300"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      {/* Checklist Items */}
      <div className="space-y-1">
        {checklist.items.map((item) => (
          <ChecklistItemRow
            key={item.id}
            item={item}
            onCheckboxChange={handleCheckboxChange}
          />
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 mt-6 pt-6 border-t border-slate-200">
        <Button
          variant="secondary"
          className="flex-1 bg-slate-100 text-slate-700 hover:bg-slate-200"
          onClick={handleExport}
        >
          <Download className="mr-2" size={16} />
          Export
        </Button>
        <Button
          variant="secondary"
          className="flex-1 bg-slate-100 text-slate-700 hover:bg-slate-200"
          onClick={handleShare}
        >
          <Share2 className="mr-2" size={16} />
          Share
        </Button>
        <Button
          variant="secondary"
          className="flex-1 bg-slate-100 text-slate-700 hover:bg-slate-200"
          onClick={handlePrint}
        >
          <Printer className="mr-2" size={16} />
          Print
        </Button>
      </div>
    </div>
  );
}

interface ChecklistItemRowProps {
  item: ChecklistItem;
  onCheckboxChange: (itemId: number, checked: boolean) => void;
}

function ChecklistItemRow({ item, onCheckboxChange }: ChecklistItemRowProps) {
  return (
    <label
      className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
    >
      <Checkbox
        id={`item-${item.id}`}
        checked={item.isCompleted}
        onCheckedChange={(checked) => onCheckboxChange(item.id, checked as boolean)}
        className="elegant-checkbox mt-0.5 shrink-0"
      />
      <span
        className={`text-slate-900 leading-snug select-none ${
          item.isCompleted ? "line-through text-slate-400" : ""
        }`}
      >
        {item.text}
      </span>
    </label>
  );
}
