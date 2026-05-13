import { motion } from "framer-motion";
import { Link } from "wouter";
import { useState } from "react";
import { Camera, MoreHorizontal, ExternalLink, EyeOff, Info, Play, Trash2 } from "lucide-react";
import { Project, useStore } from "@/store";
import { Button } from "@/components/ui/button";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { deleteProject, hasApiAuthToken, unpublishProject } from "@/lib/project-api";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

interface ProjectCardProps {
  project: Project;
  index: number;
}

export default function ProjectCard({ project, index }: ProjectCardProps) {
  const queryClient = useQueryClient();
  const removeProject = useStore((state) => state.removeProject);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [imageMissing, setImageMissing] = useState(false);
  // Generate a deterministic gradient based on project ID
  const hash = project.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue1 = hash % 360;
  const hue2 = (hash * 2) % 360;
  
  const runDelete = async () => {
    try {
      if (hasApiAuthToken()) await deleteProject(project.id);
      removeProject(project.id);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Project deleted", description: `${project.name} was removed.` });
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Could not delete this project.",
        variant: "destructive",
      });
    }
  };

  const runUnpublish = async () => {
    try {
      await unpublishProject(project.id);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Project unpublished", description: `${project.name} was removed from the showcase.` });
    } catch (error) {
      toast({
        title: "Unpublish failed",
        description: error instanceof Error ? error.message : "Could not unpublish this project.",
        variant: "destructive",
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="group relative rounded-xl border border-white/10 bg-card overflow-hidden hover:border-white/20 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1"
    >
      <div 
        className="h-40 w-full relative"
        style={{
          background: `linear-gradient(135deg, hsl(${hue1}, 70%, 40%), hsl(${hue2}, 70%, 20%))`
        }}
      >
        {project.thumbnail && !imageMissing ? (
          <img src={project.thumbnail} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" onError={() => setImageMissing(true)} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-white/5">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-white/15 bg-black/20 text-white/70">
              <Camera className="h-7 w-7" />
            </div>
          </div>
        )}
        
        {/* Hover overlay actions */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button asChild size="sm" className="bg-primary hover:bg-primary/90 text-white">
            <Link href={`/builder/${project.id}`}>
              <Play className="w-4 h-4 mr-2" /> Open
            </Link>
          </Button>
          <Button size="sm" variant="secondary" asChild>
            <Link href={`/project/${project.id}`}>
              <ExternalLink className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </div>
      
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold truncate pr-2">{project.name}</h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild><Link href={`/builder/${project.id}`} className="w-full flex items-center"><Play className="w-4 h-4 mr-2" /> Open Builder</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link href={`/project/${project.id}`} className="w-full flex items-center"><ExternalLink className="w-4 h-4 mr-2" /> View Public Page</Link></DropdownMenuItem>
              {project.status === "published" && <DropdownMenuItem onClick={runUnpublish}><EyeOff className="w-4 h-4 mr-2" /> Unpublish</DropdownMenuItem>}
              <DropdownMenuItem asChild><Link href="/profile" className="w-full flex items-center"><Info className="w-4 h-4 mr-2" /> Info</Link></DropdownMenuItem>
              <DropdownMenuItem onSelect={(event) => { event.preventDefault(); setDeleteOpen(true); }} className="text-destructive focus:text-destructive"><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{project.lastModified}</span>
          <Badge variant="outline" className={
            project.status === "active" ? "text-green-400 border-green-400/20 bg-green-400/10" :
            project.status === "published" ? "text-primary border-primary/20 bg-primary/10" :
            "text-muted-foreground border-white/10"
          }>
            {project.status}
          </Badge>
        </div>
      </div>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="border-white/10 bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              "{project.name}" will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void runDelete()}>
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
