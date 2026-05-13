import { motion } from "framer-motion";
import { Link } from "wouter";
import { useState } from "react";
import { Camera, Heart, Eye, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export interface CommunityProject {
  id: string;
  name: string;
  creator: string;
  views: string;
  likes: string;
  tags: string[];
  previewImageUrl?: string | null;
  createdAt?: string;
}

interface CommunityCardProps {
  project: CommunityProject;
  index: number;
}

export default function CommunityCard({ project, index }: CommunityCardProps) {
  const [imageMissing, setImageMissing] = useState(false);
  const hash = project.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue1 = hash % 360;
  const hue2 = (hash * 2) % 360;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="group relative rounded-xl border border-white/10 bg-card overflow-hidden hover:border-white/20 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 mb-6 inline-block w-full"
    >
      <div
        className="h-48 w-full relative"
        style={{
          background: `linear-gradient(135deg, hsl(${hue1}, 70%, 40%), hsl(${hue2}, 70%, 20%))`
        }}
      >
        {project.previewImageUrl && !imageMissing ? (
          <img
            src={project.previewImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            onError={() => setImageMissing(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-white/5">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-white/15 bg-black/20 text-white/70">
              <Camera className="h-7 w-7" />
            </div>
          </div>
        )}
        
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button asChild className="bg-primary hover:bg-primary/90 text-white">
            <Link href={`/project/${project.id}`}>
              <Play className="w-4 h-4 mr-2" /> Preview
            </Link>
          </Button>
        </div>
      </div>
      
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-semibold truncate pr-2">{project.name}</h3>
        </div>
        
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6 border border-white/10">
              <AvatarFallback className="bg-primary/20 text-primary text-[10px]">{project.creator.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <span className="text-xs font-medium text-muted-foreground">{project.creator}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Heart className="w-3 h-3 fill-current text-primary" /> {project.likes}</span>
            <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {project.views}</span>
          </div>
        </div>
        {project.createdAt && (
          <div className="mt-2 text-[11px] text-muted-foreground">
            Published {new Date(project.createdAt).toLocaleString()}
          </div>
        )}
        <div className="flex flex-wrap gap-1 mt-3">
          {project.tags.map(tag => (
            <Badge key={tag} variant="secondary" className="bg-white/5 border-white/10 hover:bg-white/10 text-[10px] px-1.5">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
