import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { User, Folder, Globe, CreditCard, Settings, Upload, Github, Twitter, Linkedin, AlertTriangle } from "lucide-react";
import { useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import ProjectCard from "@/components/ProjectCard";
import { useQuery } from "@tanstack/react-query";
import { fetchProjects, hasApiAuthToken, openBillingPortal, startBillingCheckout, type ApiProject } from "@/lib/project-api";
import { clearAuthSession, deleteAccount } from "@/lib/project-api";
import type { Project } from "@/store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

type ProfileDraft = {
  name: string;
  email: string;
  avatar: string | null;
  bio: string;
  github: string;
  twitter: string;
  linkedin: string;
};

export default function ProfilePage() {
  const { user, projects } = useStore();
  const setUser = useStore((state) => state.setUser);
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("profile");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [profile, setProfile] = useState(() => loadProfileDraft(user));
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
    enabled: hasApiAuthToken(),
    retry: false,
  });
  const visibleProjects = hasApiAuthToken() ? (projectsQuery.data?.map(toStoreProject) ?? []) : projects;
  const usage = usageForPlan(user.plan, visibleProjects.length);
  const planLabel = user.plan || "Free";

  const saveProfile = () => {
    localStorage.setItem("forma_profile", JSON.stringify(profile));
    setUser({
      name: profile.name,
      email: profile.email,
      avatar: profile.avatar,
    });
    toast({ title: "Profile saved", description: "Your profile details were stored locally." });
  };

  const uploadAvatar = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Avatar not uploaded", description: "Choose an image file.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const avatar = typeof reader.result === "string" ? reader.result : null;
      if (!avatar) return;
      setProfile((draft: ProfileDraft) => ({ ...draft, avatar }));
      setUser({ avatar });
      localStorage.setItem("forma_profile", JSON.stringify({ ...profile, avatar }));
      toast({ title: "Avatar uploaded", description: "Save changes to keep the rest of your profile edits." });
    };
    reader.readAsDataURL(file);
  };

  const goBillingPortal = async (action: string) => {
    try {
      const portal = await openBillingPortal();
      window.location.href = portal.url;
    } catch (error) {
      toast({
        title: `${action} unavailable`,
        description: error instanceof Error ? error.message : "Billing portal is not available yet.",
        variant: "destructive",
      });
    }
  };

  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "projects", label: "Projects", icon: Folder },
    { id: "published", label: "Published", icon: Globe },
    { id: "billing", label: "Billing", icon: CreditCard },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex-1 flex max-w-6xl mx-auto w-full p-6 md:p-8 gap-8">
      {/* Left Sidebar */}
      <div className="w-64 shrink-0 space-y-1 hidden md:block">
        <div className="flex items-center gap-3 px-4 py-6 mb-2 border-b border-white/10">
          <Avatar className="w-12 h-12 border border-white/20">
            {user.avatar && <AvatarImage src={user.avatar} alt="" />}
            <AvatarFallback className="bg-primary/20 text-primary">{user.name.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-semibold">{user.name}</div>
            <div className="text-xs text-muted-foreground">{planLabel} Plan</div>
          </div>
        </div>
        
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id 
                ? 'bg-primary/10 text-primary' 
                : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 max-w-3xl">
        {activeTab === "profile" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight mb-1">Profile Details</h1>
              <p className="text-muted-foreground">Manage your personal information and public profile.</p>
            </div>

            <div className="flex items-center gap-6 p-6 border border-white/10 rounded-xl bg-white/5">
              <Avatar className="w-24 h-24 border-2 border-white/10">
                {profile.avatar && <AvatarImage src={profile.avatar} alt="" />}
                <AvatarFallback className="bg-primary/20 text-primary text-2xl">{profile.name.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <Button className="bg-white text-black hover:bg-white/90 gap-2" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4" /> Upload Avatar</Button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => uploadAvatar(event.currentTarget.files)} />
                <p className="text-xs text-muted-foreground">Recommended size: 400x400px. Max 2MB.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" value={profile.name} onChange={(event) => setProfile((draft: ProfileDraft) => ({ ...draft, name: event.target.value }))} className="bg-white/5 border-white/10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" value={profile.email} onChange={(event) => setProfile((draft: ProfileDraft) => ({ ...draft, email: event.target.value }))} className="bg-white/5 border-white/10" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" value={profile.bio} onChange={(event) => setProfile((draft: ProfileDraft) => ({ ...draft, bio: event.target.value }))} placeholder="Tell the community about yourself..." className="bg-white/5 border-white/10 min-h-[100px]" />
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b border-white/10 pb-2">Social Links</h3>
              <div className="grid gap-4">
                <div className="flex items-center gap-3">
                  <Github className="w-5 h-5 text-muted-foreground" />
                  <Input value={profile.github} onChange={(event) => setProfile((draft: ProfileDraft) => ({ ...draft, github: event.target.value }))} placeholder="github.com/username" className="bg-white/5 border-white/10" />
                </div>
                <div className="flex items-center gap-3">
                  <Twitter className="w-5 h-5 text-muted-foreground" />
                  <Input value={profile.twitter} onChange={(event) => setProfile((draft: ProfileDraft) => ({ ...draft, twitter: event.target.value }))} placeholder="twitter.com/username" className="bg-white/5 border-white/10" />
                </div>
                <div className="flex items-center gap-3">
                  <Linkedin className="w-5 h-5 text-muted-foreground" />
                  <Input value={profile.linkedin} onChange={(event) => setProfile((draft: ProfileDraft) => ({ ...draft, linkedin: event.target.value }))} placeholder="linkedin.com/in/username" className="bg-white/5 border-white/10" />
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <Button className="bg-primary hover:bg-primary/90 text-white px-8" onClick={saveProfile}>Save Changes</Button>
            </div>
          </motion.div>
        )}

        {activeTab === "projects" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight mb-1">Your Projects</h1>
                <p className="text-muted-foreground">Manage all your Forma workspaces.</p>
              </div>
              <Button className="bg-primary hover:bg-primary/90 text-white">New Project</Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {visibleProjects.map((project, index) => (
                <ProjectCard key={project.id} project={project} index={index} />
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === "published" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight mb-1">Published Projects</h1>
              <p className="text-muted-foreground">Projects you've shared with the community or published to the web.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {visibleProjects.filter(p => p.status === 'published').map((project, index) => (
                <ProjectCard key={project.id} project={project} index={index} />
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === "billing" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight mb-1">Billing & Usage</h1>
              <p className="text-muted-foreground">Manage your subscription and usage limits.</p>
            </div>

            <div className="p-6 border border-primary/30 rounded-xl bg-primary/5 flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-xl font-bold">Pro Plan</h2>
                  <span className="bg-primary text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Active</span>
                </div>
                <p className="text-muted-foreground mb-4">$19/month • Includes a 7-day trial for new subscriptions.</p>
                <div className="flex gap-3">
                  <Button variant="outline" className="border-white/20" onClick={() => goBillingPortal("Cancel plan")}>Cancel Plan</Button>
                  <Button className="bg-white text-black hover:bg-white/90" onClick={async () => {
                    try {
                      const checkout = await startBillingCheckout("studio");
                      window.location.href = checkout.url;
                    } catch (error) {
                      toast({ title: "Upgrade failed", description: error instanceof Error ? error.message : "Could not start checkout.", variant: "destructive" });
                    }
                  }}>Upgrade to Studio</Button>
                </div>
              </div>
              <div className="w-full md:w-64 p-4 rounded-lg bg-black/40 border border-white/10">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Projects Limit</span>
                  <span className="text-sm text-muted-foreground">{visibleProjects.length} / {usage.projectLimit}</span>
                </div>
                <Progress value={(visibleProjects.length / usage.projectLimit) * 100} className="h-2 mb-4 bg-white/10 [&>div]:bg-primary" />
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">AI Tokens</span>
                  <span className="text-sm text-muted-foreground">{formatCompact(usage.aiTokensUsed)} / {formatCompact(usage.aiTokenLimit)}</span>
                </div>
                <Progress value={(usage.aiTokensUsed / usage.aiTokenLimit) * 100} className="h-2 bg-white/10 [&>div]:bg-primary" />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b border-white/10 pb-2">Payment Method</h3>
              <div className="flex items-center justify-between p-4 border border-white/10 rounded-xl bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-8 bg-white rounded flex items-center justify-center font-bold text-black text-xs italic">VISA</div>
                  <div>
                    <p className="font-medium">Visa ending in 4242</p>
                    <p className="text-sm text-muted-foreground">Expires 12/2025</p>
                  </div>
                </div>
                <Button variant="ghost" className="text-primary hover:text-primary/90" onClick={() => goBillingPortal("Payment update")}>Update</Button>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b border-white/10 pb-2">Invoice History</h3>
              <div className="border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white/5 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Invoice</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {[
                      { date: "Sep 12, 2024", amount: "$19.00", status: "Paid" },
                      { date: "Aug 12, 2024", amount: "$19.00", status: "Paid" },
                      { date: "Jul 12, 2024", amount: "$19.00", status: "Paid" },
                    ].map((inv, i) => (
                      <tr key={i} className="hover:bg-white/5">
                        <td className="px-4 py-3">{inv.date}</td>
                        <td className="px-4 py-3">{inv.amount}</td>
                        <td className="px-4 py-3 text-green-400">{inv.status}</td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="sm" className="h-8" onClick={() => downloadInvoice(inv)}>Download PDF</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "settings" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight mb-1">Account Settings</h1>
              <p className="text-muted-foreground">Manage your preferences and account security.</p>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b border-white/10 pb-2">Editor Preferences</h3>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Show Grid by Default</p>
                    <p className="text-sm text-muted-foreground">Enable the dot grid overlay on new canvases.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Snap to Elements</p>
                    <p className="text-sm text-muted-foreground">Automatically align elements while dragging.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">AI Suggestions</p>
                    <p className="text-sm text-muted-foreground">Show AI-powered design improvements automatically.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-8">
              <h3 className="font-semibold text-lg border-b border-destructive/20 text-destructive pb-2 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Danger Zone
              </h3>
              <div className="p-4 border border-destructive/20 rounded-xl bg-destructive/5 flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-destructive">Delete Account</p>
                  <p className="text-sm text-muted-foreground">Permanently delete your account and all projects. This cannot be undone.</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">Delete Account</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="border-white/10 bg-background">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently removes your account and all projects. Published projects will also disappear from the showcase.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deletingAccount}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={deletingAccount}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={async (event) => {
                          event.preventDefault();
                          setDeletingAccount(true);
                          try {
                            await deleteAccount();
                            clearAuthSession();
                            toast({ title: "Account deleted", description: "Your Forma account was removed." });
                            setLocation("/login");
                          } catch (error) {
                            toast({
                              title: "Delete failed",
                              description: error instanceof Error ? error.message : "Could not delete your account.",
                              variant: "destructive",
                            });
                          } finally {
                            setDeletingAccount(false);
                          }
                        }}
                      >
                        {deletingAccount ? "Deleting..." : "Delete Account"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </motion.div>
        )}
      </div>
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
    views: typeof metadata.views === "number" ? metadata.views : 0,
    likes: typeof metadata.likes === "number" ? metadata.likes : 0,
    isPublic: project.status === "published",
    tags: Array.isArray(metadata.tags) ? metadata.tags.map(String) : [],
    collaborators: 1,
  };
}

function loadProfileDraft(user: { name: string; email: string; avatar: string | null }): ProfileDraft {
  const fallback = { name: user.name, email: user.email, avatar: user.avatar, bio: "", github: "", twitter: "", linkedin: "" };
  try {
    const stored = localStorage.getItem("forma_profile");
    return stored ? { ...fallback, ...JSON.parse(stored) } : fallback;
  } catch {
    return fallback;
  }
}

function usageForPlan(plan: string, projectCount: number) {
  const normalized = (plan || "free").toLowerCase();
  const projectLimit = normalized.includes("studio") ? 100 : normalized.includes("pro") ? 25 : 3;
  const aiTokenLimit = normalized.includes("studio") ? 100_000 : normalized.includes("pro") ? 25_000 : 2_000;
  const stored = Number(localStorage.getItem("forma_ai_tokens_used"));
  const aiTokensUsed = Number.isFinite(stored) && stored > 0 ? stored : Math.min(aiTokenLimit, projectCount * 750);
  return { projectLimit, aiTokenLimit, aiTokensUsed };
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null;
}

function formatCompact(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return String(value);
}

function downloadInvoice(invoice: { date: string; amount: string; status: string }) {
  const body = `Forma invoice\nDate: ${invoice.date}\nAmount: ${invoice.amount}\nStatus: ${invoice.status}\n`;
  const url = URL.createObjectURL(new Blob([body], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `forma-invoice-${invoice.date.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
