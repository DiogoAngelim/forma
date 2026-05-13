import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { register, startBillingCheckout } from "@/lib/project-api";
import { useStore } from "@/store";
import { toast } from "@/hooks/use-toast";

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const setUser = useStore((state) => state.setUser);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState<"Free" | "Pro" | "Studio">("Pro");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) setStep(2);
    else {
      setIsSubmitting(true);
      try {
        const session = await register(email, password, name);
        setUser({
          name: session.user.name || name,
          email: session.user.email,
          avatar: session.user.avatar ?? null,
          plan,
        });
        if (plan === "Pro" || plan === "Studio") {
          const checkout = await startBillingCheckout(plan.toLowerCase() as "pro" | "studio");
          window.location.href = checkout.url;
          return;
        }
        setLocation("/");
      } catch (error) {
        toast({
          title: "Sign up failed",
          description: error instanceof Error ? error.message : "Could not create your account.",
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="min-h-[100dvh] flex bg-background text-foreground overflow-hidden">
      <div className="hidden lg:flex flex-1 relative bg-black items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-black pointer-events-none" />
        <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1 }}
          className="z-10 text-center"
        >
          <div className="w-16 h-16 rounded-lg bg-primary mb-8 mx-auto rotate-12 flex items-center justify-center">
            <div className="w-8 h-8 bg-white rounded-sm rotate-45" />
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter mb-4">Join Forma</h1>
          <p className="text-xl text-white/60 font-medium">Design at the speed of thought.</p>
        </motion.div>
      </div>
      
      <div className="flex-1 flex items-center justify-center p-8 lg:p-24 relative">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground font-medium">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step === 1 ? 'bg-primary text-white' : 'bg-white/10'}`}>1</span>
              <div className="h-[1px] w-8 bg-white/10" />
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step === 2 ? 'bg-primary text-white' : 'bg-white/10'}`}>2</span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight">
              {step === 1 ? "Create your account" : "Choose your plan"}
            </h2>
            <p className="text-muted-foreground mt-2">
              {step === 1 ? "Start building premium interfaces today." : "You can change this later."}
            </p>
          </div>

          <form onSubmit={handleNext}>
            {step === 1 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input id="name" value={name} onChange={e => setName(e.target.value)} required className="bg-white/5 border-white/10" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="bg-white/5 border-white/10" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required className="bg-white/5 border-white/10" />
                </div>
                <Button type="submit" className="w-full bg-primary hover:bg-primary/90 mt-4">Continue to Plan</Button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                <div className="grid gap-4">
                  {(["Free", "Pro", "Studio"] as const).map((p) => (
                    <div 
                      key={p}
                      onClick={() => setPlan(p)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${plan === p ? 'border-primary bg-primary/10' : 'border-white/10 hover:border-white/20'}`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <h3 className="font-semibold">{p}</h3>
                        <span className="font-medium text-muted-foreground">
                          {p === "Free" ? "$0" : p === "Pro" ? "$19/mo" : "$49/mo"}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {p === "Free" ? "Explore uploads and previews." : p === "Pro" ? "7-day trial, unlimited conversions, exports, and publishing." : "7-day trial, higher limits and agency-ready workflows."}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 mt-6">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1 border-white/10">Back</Button>
                  <Button type="submit" disabled={isSubmitting} className="flex-[2] bg-primary hover:bg-primary/90">
                    {isSubmitting ? "Creating..." : "Complete Sign Up"}
                  </Button>
                </div>
              </motion.div>
            )}
          </form>

          {step === 1 && (
            <div className="text-center text-sm text-muted-foreground mt-8">
              Already have an account? <span className="text-primary hover:underline cursor-pointer" onClick={() => setLocation("/login")}>Sign in</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
