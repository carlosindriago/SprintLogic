import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Editor from '@monaco-editor/react';
import { getPrompts, updatePrompt, restorePrompt, PromptRegistryItem } from '../lib/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function PromptStudioTab() {
  const [prompts, setPrompts] = useState<PromptRegistryItem[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [currentContent, setCurrentContent] = useState<string>('');
  
  const [isSaveAlertOpen, setIsSaveAlertOpen] = useState(false);
  const [isRestoreAlertOpen, setIsRestoreAlertOpen] = useState(false);

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    try {
      const data = await getPrompts();
      setPrompts(data);
      if (data.length > 0 && !selectedPromptId) {
        handleSelectPrompt(data[0]);
      }
    } catch (err: any) {
      toast.error('Error fetching prompts', { description: err?.message || 'Network error' });
    }
  };

  const handleSelectPrompt = (prompt: PromptRegistryItem) => {
    setSelectedPromptId(prompt.id);
    setCurrentContent(prompt.content);
  };

  const selectedPrompt = prompts.find(p => p.id === selectedPromptId);

  const handleSave = async () => {
    if (!selectedPromptId) return;
    try {
      const data = await updatePrompt(selectedPromptId, currentContent);
      toast.success('Prompt saved successfully');
      setPrompts(prev => prev.map(p => p.id === selectedPromptId ? data : p));
    } catch (err: any) {
      const errorData = err.response?.data || err;
      toast.error(errorData?.detail || 'Error saving prompt');
    } finally {
      setIsSaveAlertOpen(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedPromptId) return;
    try {
      const data = await restorePrompt(selectedPromptId);
      toast.success('Prompt restored to golden state');
      setPrompts(prev => prev.map(p => p.id === selectedPromptId ? data : p));
      setCurrentContent(data.content);
    } catch (err: any) {
      toast.error('Error restoring prompt');
    } finally {
      setIsRestoreAlertOpen(false);
    }
  };

  return (
    <div className="flex h-full w-full space-x-4 p-4 text-sm text-foreground bg-background">
      {/* Sidebar for prompt list */}
      <Card className="w-1/4 p-4 overflow-y-auto space-y-2 border-border bg-card text-card-foreground">
        <h2 className="font-bold mb-4 text-lg">Prompts</h2>
        {prompts.map(prompt => (
          <div
            key={prompt.id}
            className={`p-2 rounded cursor-pointer border ${selectedPromptId === prompt.id ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent border-transparent'}`}
            onClick={() => handleSelectPrompt(prompt)}
          >
            <div className="font-medium">{prompt.id}</div>
            <div className="text-xs opacity-70 truncate">{prompt.description}</div>
          </div>
        ))}
      </Card>

      {/* Editor area */}
      <div className="flex-1 flex flex-col space-y-4">
        {selectedPrompt ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-xl">{selectedPrompt.id}</h2>
                {selectedPrompt.required_variables && selectedPrompt.required_variables.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Required variables: {selectedPrompt.required_variables.join(', ')}
                  </div>
                )}
              </div>
              <div className="space-x-2">
                <Button variant="outline" onClick={() => setIsRestoreAlertOpen(true)}>Restore Golden</Button>
                <Button onClick={() => setIsSaveAlertOpen(true)}>Save Prompt</Button>
              </div>
            </div>

            <div className="flex-1 border rounded overflow-hidden">
              <Editor
                height="100%"
                language="markdown"
                theme="vs-dark"
                value={currentContent}
                onChange={(value) => setCurrentContent(value || '')}
                options={{
                  minimap: { enabled: false },
                  wordWrap: 'on',
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a prompt to edit
          </div>
        )}
      </div>

      {/* Alert Dialogs */}
      <AlertDialog open={isSaveAlertOpen} onOpenChange={setIsSaveAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save Prompt</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to save changes to this prompt? If required variables are missing, the server will reject it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isRestoreAlertOpen} onOpenChange={setIsRestoreAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Golden Prompt</AlertDialogTitle>
            <AlertDialogDescription>
              This will overwrite your current changes with the default golden prompt. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
