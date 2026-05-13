import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { googleAuthUrl, login } from "@/lib/project-api";
import { useStore } from "@/store";
import { toast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const setUser = useStore((state) => state.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const session = await login(email, password);
      setUser({
        name: session.user.name || session.user.email.split("@")[0],
        email: session.user.email,
        avatar: session.user.avatar ?? null,
      });
      setLocation("/");
    } catch (error) {
      toast({
        title: "Sign in failed",
        description: error instanceof Error ? error.message : "Could not sign in.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex bg-background text-foreground overflow-hidden">
      <div className="hidden lg:flex flex-1 relative bg-black items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-black pointer-events-none" />
        <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="z-10 text-center"
        >
          <h1 className="text-6xl font-black text-white tracking-tighter mb-4">Forma</h1>
          <p className="text-xl text-white/60 font-medium">The premium visual builder.</p>
        </motion.div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8 lg:p-24 relative">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold tracking-tight">Welcome back</h2>
            <p className="text-muted-foreground mt-2">Enter your credentials to continue</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="bg-white/5 border-white/10 focus-visible:ring-primary" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required className="bg-white/5 border-white/10 focus-visible:ring-primary" />
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-full bg-primary hover:bg-primary/90 text-white font-medium">
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
            <Button type="button" variant="outline" className="w-full border-white/10 hover:bg-white/5" onClick={() => { window.location.href = googleAuthUrl(); }}>
              Sign in with Google
            </Button>
          </form>
          <div className="text-center text-sm text-muted-foreground">
            Don't have an account? <span className="text-primary hover:underline cursor-pointer" onClick={() => setLocation("/register")}>Sign up</span>
          </div>
        </div>
      </div>
    </div>
  );
}
