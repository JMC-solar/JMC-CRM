import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

interface ExportButtonsProps {
  module: "contacts" | "inventory" | "quotations" | "projects";
  params?: Record<string, string | undefined>;
}

export default function ExportButtons({ module, params }: ExportButtonsProps) {
  const buildUrl = (format: "xlsx" | "pdf") => {
    const queryParams = new URLSearchParams();
    if (format === "pdf") queryParams.set("format", "pdf");
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value) queryParams.set(key, value);
      });
    }
    const qs = queryParams.toString();
    return `/api/export/${module}${qs ? `?${qs}` : ""}`;
  };

  const handleExport = (format: "xlsx" | "pdf") => {
    const url = buildUrl(format);
    if (format === "pdf") {
      window.open(url, "_blank");
    } else {
      // Download Excel file
      const a = document.createElement("a");
      a.href = url;
      a.download = `${module}-export.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport("xlsx")} className="gap-2 cursor-pointer">
          <FileSpreadsheet className="h-4 w-4 text-green-500" />
          Export to Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("pdf")} className="gap-2 cursor-pointer">
          <FileText className="h-4 w-4 text-red-500" />
          Export to PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
