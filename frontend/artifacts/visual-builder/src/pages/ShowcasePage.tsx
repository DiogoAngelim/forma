import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Search, Filter, Layout } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CommunityCard, { CommunityProject } from "@/components/showcase/CommunityCard";
import { fetchShowcaseProjects } from "@/lib/project-api";

const tags = ["All", "Landing Pages", "Dashboards", "E-commerce", "Portfolios", "SaaS", "Mobile"];

export default function ShowcasePage() {
  const [activeTag, setActiveTag] = useState("All");
  const [search, setSearch] = useState("");
  const showcaseQuery = useQuery({
    queryKey: ["showcase"],
    queryFn: fetchShowcaseProjects,
    retry: false,
  });
  const projects = (showcaseQuery.data ?? []).map((project) => ({
    id: project.slug,
    name: project.title,
    creator: project.author?.name ?? "Forma creator",
    views: `${project.generatedFileCount ?? project.blockCount ?? 0} files`,
    likes: formatCount(project.likes ?? 0),
    tags: normalizeTags(project.metadata?.tags),
    previewImageUrl: project.previewImageUrl,
    createdAt: project.createdAt,
  })).filter((project) => {
    const query = search.trim().toLowerCase();
    const tagMatch = activeTag === "All" || project.tags.some((tag) => tag.toLowerCase() === activeTag.toLowerCase().replace(/s$/, ""));
    const searchMatch = !query || project.name.toLowerCase().includes(query) || project.creator.toLowerCase().includes(query) || project.tags.some((tag) => tag.toLowerCase().includes(query));
    return tagMatch && searchMatch;
  });

  return (
    <div className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full space-y-12">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 text-center max-w-2xl mx-auto pt-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-6">
          <Layout className="w-8 h-8" />
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter">Community Showcase</h1>
        <p className="text-xl text-muted-foreground">Discover thousands of premium interfaces built by the Forma community.</p>
        
        <div className="flex items-center gap-2 max-w-md mx-auto relative">
          <Search className="w-5 h-5 absolute left-4 text-muted-foreground" />
          <Input 
            type="text" 
            placeholder="Search projects..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/5 border-white/10 rounded-full h-12 pl-12 pr-4 text-base focus-visible:ring-primary"
          />
        </div>

        <div className="flex flex-wrap justify-center gap-2 pt-4">
          {tags.map(tag => (
            <Button 
              key={tag} 
              variant={activeTag === tag ? "default" : "outline"}
              className={`rounded-full ${activeTag !== tag && 'border-white/10 bg-white/5 hover:bg-white/10'}`}
              onClick={() => setActiveTag(tag)}
            >
              {tag}
            </Button>
          ))}
        </div>
      </motion.div>

      {projects.length > 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2"><Filter className="w-5 h-5 text-primary" /> Trending Now</h2>
          </div>
          
          <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6">
            {projects.map((project, index) => (
              <CommunityCard key={project.id} project={project} index={index} />
            ))}
          </div>
        </motion.div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 p-10 text-center">
          <h2 className="text-xl font-semibold">No published projects yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Published Forma projects will appear here as soon as the community shares them.
          </p>
        </div>
      )}
    </div>
  );
}

function normalizeTags(value: unknown): string[] {
  const tags = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return tags.length ? tags : ["forma"];
}

function formatCount(value: number) {
  if (value > 999) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}
