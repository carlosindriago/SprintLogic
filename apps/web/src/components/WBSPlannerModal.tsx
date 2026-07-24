import React, { useState } from "react";
import { WBSHierarchicalResponse, WorkPackage, WBSSubtask } from "../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface WBSPlannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wbsData: WBSHierarchicalResponse | null;
  onSave?: (data: WBSHierarchicalResponse) => void;
}

export function WBSPlannerModal({ open, onOpenChange, wbsData, onSave }: WBSPlannerModalProps) {
  const [editedData, setEditedData] = useState<WBSHierarchicalResponse | null>(wbsData);

  // Sync state when props change
  React.useEffect(() => {
    if (wbsData) setEditedData(JSON.parse(JSON.stringify(wbsData)));
  }, [wbsData]);

  if (!editedData) return null;

  const handleEstimateChange = (pkgId: string, subtaskId: string, newValue: number) => {
    const newData = { ...editedData };
    const pkg = newData.work_packages.find(p => p.id === pkgId);
    if (pkg) {
      const task = pkg.subtasks.find(t => t.id === subtaskId);
      if (task) {
        task.estimated_hours = newValue;
      }
    }
    
    // Recalculate total
    let total = 0;
    newData.work_packages.forEach(p => {
      p.subtasks.forEach(t => {
        total += Number(t.estimated_hours) || 0;
      });
    });
    newData.total_estimated_hours = total;
    setEditedData(newData);
  };

  const handleSave = () => {
    if (onSave && editedData) onSave(editedData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] bg-[#0d0d0d] border-[#27272a] text-zinc-300 flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-zinc-100">
            WBS Planner 
            <Badge variant="outline" className="ml-4 bg-blue-500/10 text-blue-400 border-blue-500/20">
              Total: {editedData.total_estimated_hours} hrs
            </Badge>
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 pr-4 mt-4 h-[60vh]">
          <div className="space-y-8">
            {editedData.work_packages.map((pkg) => (
              <div key={pkg.id} className="bg-[#151515] border border-[#27272a] rounded-lg p-4">
                <div className="mb-4 border-b border-[#27272a] pb-2">
                  <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                    <span className="text-blue-400">Epic {pkg.id}:</span> {pkg.title}
                  </h3>
                  <p className="text-sm text-zinc-400 mt-1">{pkg.objective}</p>
                </div>
                
                <div className="space-y-3 pl-4 border-l-2 border-[#27272a] ml-2">
                  {pkg.subtasks.map((task) => (
                    <div key={task.id} className="flex justify-between items-start bg-[#1a1a1a] p-3 rounded border border-[#27272a]">
                      <div className="flex-1 mr-4">
                        <div className="font-semibold text-zinc-200">
                          <span className="text-zinc-500 mr-2">{task.id}</span>
                          {task.title}
                        </div>
                        <p className="text-xs text-zinc-400 mt-1">{task.description}</p>
                        {task.dependencies && task.dependencies.length > 0 && (
                          <div className="text-xs mt-2 text-amber-500/80">
                            Dependencies: {task.dependencies.join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 w-32">
                        <Input 
                          type="number"
                          className="h-8 bg-zinc-900 border-zinc-800 text-right"
                          value={task.estimated_hours}
                          onChange={(e) => handleEstimateChange(pkg.id, task.id, parseFloat(e.target.value) || 0)}
                        />
                        <span className="text-xs text-zinc-500">hrs</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        
        <DialogFooter className="mt-6 border-t border-[#27272a] pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-zinc-900 border-zinc-800 text-zinc-300">
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white">
            Approve & Create Epics
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
