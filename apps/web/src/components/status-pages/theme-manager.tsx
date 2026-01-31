"use client";

import { useState } from "react";
import { Plus, Palette, Pencil, Trash2, Star, ArrowLeft } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Badge,
  cn,
} from "@uni-status/ui";
import {
  useStatusPageThemes,
  useCreateStatusPageTheme,
  useUpdateStatusPageTheme,
  useDeleteStatusPageTheme,
} from "@/hooks/use-status-page-themes";
import { ThemeEditor } from "./theme-editor";
import { ThemePreview } from "./theme-preview";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import type { StatusPageTheme, StatusPageThemeColors } from "@/lib/api-client";

interface ThemeManagerProps {
  onBack: () => void;
}

export function ThemeManager({ onBack }: ThemeManagerProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<StatusPageTheme | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [themeToDelete, setThemeToDelete] = useState<StatusPageTheme | null>(null);

  const { data: themes, isLoading, error, refetch } = useStatusPageThemes();
  const createTheme = useCreateStatusPageTheme();
  const updateTheme = useUpdateStatusPageTheme();
  const deleteTheme = useDeleteStatusPageTheme();

  const handleCreateNew = () => {
    setEditingTheme(undefined);
    setEditorOpen(true);
  };

  const handleEdit = (theme: StatusPageTheme) => {
    setEditingTheme(theme);
    setEditorOpen(true);
  };

  const handleDelete = (theme: StatusPageTheme) => {
    setThemeToDelete(theme);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!themeToDelete) return;
    await deleteTheme.mutateAsync(themeToDelete.id);
    setDeleteDialogOpen(false);
    setThemeToDelete(null);
  };

  const handleSave = async (data: {
    name: string;
    description?: string;
    colors: StatusPageThemeColors;
    isDefault: boolean;
  }) => {
    if (editingTheme) {
      await updateTheme.mutateAsync({
        id: editingTheme.id,
        data,
      });
    } else {
      await createTheme.mutateAsync(data);
    }
    setEditorOpen(false);
    setEditingTheme(undefined);
  };

  if (editorOpen) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setEditorOpen(false)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Themes
          </Button>
          <h2 className="text-xl font-semibold">
            {editingTheme ? "Edit Theme" : "Create New Theme"}
          </h2>
        </div>
        <Card>
          <CardContent className="pt-6">
            <ThemeEditor
              theme={editingTheme}
              onSave={handleSave}
              onCancel={() => setEditorOpen(false)}
              isSaving={createTheme.isPending || updateTheme.isPending}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <ThemeManagerHeader onBack={onBack} onCreateNew={handleCreateNew} />
        <LoadingState variant="card" count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <ThemeManagerHeader onBack={onBack} onCreateNew={handleCreateNew} />
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ThemeManagerHeader onBack={onBack} onCreateNew={handleCreateNew} />

      {!themes || themes.length === 0 ? (
        <EmptyState
          icon={Palette}
          title="No themes yet"
          description="Create your first custom theme to personalize your status pages."
          action={{
            label: "Create Theme",
            onClick: handleCreateNew,
            icon: Plus,
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {themes.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              onEdit={() => handleEdit(theme)}
              onDelete={() => handleDelete(theme)}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Theme</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the theme &quot;{themeToDelete?.name}&quot;?
              Status pages using this theme will revert to their default colors.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteTheme.isPending}
            >
              {deleteTheme.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ThemeManagerHeader({
  onBack,
  onCreateNew,
}: {
  onBack: () => void;
  onCreateNew: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Theme Manager</h1>
          <p className="text-muted-foreground">
            Create and manage color themes for your status pages
          </p>
        </div>
      </div>
      <Button onClick={onCreateNew}>
        <Plus className="mr-2 h-4 w-4" />
        Create Theme
      </Button>
    </div>
  );
}

interface ThemeCardProps {
  theme: StatusPageTheme;
  onEdit: () => void;
  onDelete: () => void;
}

function ThemeCard({ theme, onEdit, onDelete }: ThemeCardProps) {
  return (
    <Card className="group relative overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              {theme.name}
              {theme.isDefault && (
                <Badge variant="secondary" className="text-xs">
                  <Star className="h-3 w-3 mr-1" />
                  Default
                </Badge>
              )}
            </CardTitle>
            {theme.description && (
              <CardDescription className="text-sm">
                {theme.description}
              </CardDescription>
            )}
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Color Swatches */}
        <div className="flex gap-1.5 flex-wrap">
          <ColorSwatch color={theme.colors.primary} label="Primary" />
          <ColorSwatch color={theme.colors.background} label="BG" />
          <ColorSwatch color={theme.colors.surface} label="Surface" />
          <ColorSwatch color={theme.colors.text} label="Text" />
          <ColorSwatch color={theme.colors.success} label="Success" />
          <ColorSwatch color={theme.colors.warning} label="Warning" />
          <ColorSwatch color={theme.colors.error} label="Error" />
        </div>

        {/* Mini Preview */}
        <div className="mt-3">
          <ThemePreview colors={theme.colors} mode="light" className="scale-[0.85] origin-top-left" />
        </div>
      </CardContent>
    </Card>
  );
}

function ColorSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className="w-6 h-6 rounded-md border shadow-sm"
        style={{ backgroundColor: color }}
        title={`${label}: ${color}`}
      />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}
