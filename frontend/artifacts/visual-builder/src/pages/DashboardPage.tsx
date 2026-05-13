import { Link } from "wouter";
import { motion } from "framer-motion";
import { useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Plus, Layout } from "lucide-react";
import ProjectCard from "@/components/ProjectCard";
import UploadModal from "@/components/UploadModal";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { deleteProjects, fetchProjects, hasApiAuthToken, type ApiProject } from "@/lib/project-api";
import type { Project } from "@/store";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function DashboardPage() {
  const { projects, user, setProjects } = useStore();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const apiAuthed = hasApiAuthToken();
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
    enabled: apiAuthed,
    retry: false,
  });
  const visibleProjects = apiAuthed ? (projectsQuery.data?.map(toStoreProject) ?? []) : projects;

  useEffect(() => {
    if (projectsQuery.data) {
      setProjects(projectsQuery.data.map(toStoreProject));
    }
  }, [projectsQuery.data, setProjects]);

  const deleteSelected = async () => {
    if (!selectedIds.length) return;

    try {
      if (apiAuthed) await deleteProjects(selectedIds);
      setProjects(projects.filter((project) => !selectedIds.includes(project.id)));
      await projectsQuery.refetch();
      setSelectedIds([]);
      setSelectionMode(false);
      toast({ title: "Projects deleted", description: "The selected projects were removed." });
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Could not delete selected projects.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full space-y-12">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Good morning, {user.name.split(' ')[0]}</h1>
          <p className="text-muted-foreground">Here's what's happening with your projects.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button className="bg-primary hover:bg-primary/90 text-white gap-2" onClick={() => setIsUploadModalOpen(true)}>
            <Plus className="w-4 h-4" /> New Project
          </Button>
          <Button variant="outline" className="border-white/10 gap-2" asChild>
            <Link href="/showcase"><Layout className="w-4 h-4" /> Browse Community</Link>
          </Button>
          {visibleProjects.length > 0 && (
            <Button variant="outline" className="border-white/10" onClick={() => setSelectionMode((value) => !value)}>
              {selectionMode ? "Cancel selection" : "Select projects"}
            </Button>
          )}
          {selectionMode && visibleProjects.length > 0 && (
            <Button variant="destructive" disabled={!selectedIds.length} onClick={() => setDeleteSelectedOpen(true)}>
              Delete selected ({selectedIds.length})
            </Button>
          )}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent Projects</h2>
          {visibleProjects.length > 0 && (
            <Button variant="link" className="text-primary h-auto p-0" asChild>
              <Link href="/profile">View all</Link>
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleProjects.map((project, index) => (
            <div key={project.id} className="relative">
              {selectionMode && (
                <label className="absolute left-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-background/90">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={selectedIds.includes(project.id)}
                    onChange={(event) => {
                      setSelectedIds((ids) => event.target.checked ? [...ids, project.id] : ids.filter((id) => id !== project.id));
                    }}
                  />
                </label>
              )}
              <ProjectCard project={project} index={index} />
            </div>
          ))}
        </div>
        {apiAuthed && !projectsQuery.isLoading && visibleProjects.length === 0 && (
          <div className="rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-muted-foreground">
            No projects yet. Create one from an upload or URL.
          </div>
        )}
      </motion.div>

      <UploadModal open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen} />
      <AlertDialog open={deleteSelectedOpen} onOpenChange={setDeleteSelectedOpen}>
        <AlertDialogContent className="border-white/10 bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected projects?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.length} selected project{selectedIds.length === 1 ? "" : "s"} will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void deleteSelected()}>
              Delete selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function toStoreProject(project: ApiProject): Project {
  const metadata = project.metadata ?? {};
  const thumbnail = firstString(metadata.previewImageUrl, metadata.previewImage, metadata.thumbnailUrl, metadata.thumbnail);
  return {
    id: project.id,
    name: project.name,
    status: project.status === "published" ? "published" : project.status === "active" ? "active" : "draft",
    lastModified: project.updatedAt ? new Date(project.updatedAt).toLocaleString() : "Just now",
    thumbnail,
    views: numberFromMetadata(metadata.views),
    likes: numberFromMetadata(metadata.likes),
    isPublic: project.status === "published",
    tags: Array.isArray(metadata.tags) ? metadata.tags.map(String) : [],
    collaborators: 1,
  };
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null;
}

function numberFromMetadata(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
