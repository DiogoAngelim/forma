import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { AnimatePresence } from "framer-motion";

import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardPage from "@/pages/DashboardPage";
import BuilderPage from "@/pages/BuilderPage";
import ShowcasePage from "@/pages/ShowcasePage";
import ProjectPage from "@/pages/ProjectPage";
import ProfilePage from "@/pages/ProfilePage";
import { AppBar } from "@/components/AppBar";
import NotFound from "@/pages/not-found";
import { useEffect, useState } from "react";
import { fetchMe, getStoredUser, hasApiAuthToken, storeAuthSession } from "@/lib/project-api";
import { useStore } from "@/store";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const [location, setLocation] = useLocation();
  const setUser = useStore((state) => state.setUser);
  const isAuthenticated = hasApiAuthToken() || localStorage.getItem("forma_user") === "true";

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
      return;
    }

    const storedUser = getStoredUser();
    if (storedUser) {
      const localProfile = getLocalProfile();
      setUser({
        name: localProfile.name || storedUser.name || storedUser.email.split("@")[0],
        email: localProfile.email || storedUser.email,
        avatar: localProfile.avatar ?? storedUser.avatar ?? null,
        joinDate: storedUser.createdAt ? new Date(storedUser.createdAt).toLocaleDateString() : undefined,
      });
    }

    if (hasApiAuthToken()) {
      void fetchMe()
        .then((user) => {
          const localProfile = getLocalProfile();
          setUser({
            name: localProfile.name || user.name || user.email.split("@")[0],
            email: localProfile.email || user.email,
            avatar: localProfile.avatar ?? user.avatar ?? null,
            joinDate: user.createdAt ? new Date(user.createdAt).toLocaleDateString() : undefined,
            plan: typeof user.billing?.planId === "string" ? titleCase(user.billing.planId) : undefined,
          });
        })
        .catch(() => {
          localStorage.removeItem("forma_token");
          localStorage.removeItem("auth_token");
          setLocation("/login");
        });
    }
  }, [isAuthenticated, setLocation, setUser]);

  if (!isAuthenticated) return null;

  return (
    <div className="flex flex-col min-h-[100dvh]">
      {!location.startsWith("/builder/") && <AppBar />}
      <main className="flex-1 flex flex-col">
        <Component />
      </main>
    </div>
  );
}

function Router() {
  const [, setLocation] = useLocation();
  const setUser = useStore((state) => state.setUser);
  const [callbackUser] = useState(() => consumeAuthTokenFromUrl());

  useEffect(() => {
    if (!callbackUser) return;
    setUser({
      name: callbackUser.name || callbackUser.email.split("@")[0],
      email: callbackUser.email,
      avatar: callbackUser.avatar ?? null,
    });
    setLocation("/");
  }, [callbackUser, setLocation, setUser]);

  return (
    <AnimatePresence mode="wait">
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/showcase" component={() => <ProtectedRoute component={ShowcasePage} />} />
        <Route path="/project/:id" component={ProjectPage} />
        <Route path="/profile" component={() => <ProtectedRoute component={ProfilePage} />} />
        <Route path="/builder/:id" component={() => <ProtectedRoute component={BuilderPage} />} />
        <Route path="/" component={() => <ProtectedRoute component={DashboardPage} />} />
        
        <Route component={NotFound} />
      </Switch>
    </AnimatePresence>
  );
}

function consumeAuthTokenFromUrl() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("token");
  if (!token) return null;

  const tokenUser = userFromJwt(token);
  storeAuthSession({ token, user: tokenUser });
  url.searchParams.delete("token");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  return tokenUser;
}

function userFromJwt(token: string) {
  const payload = decodeJwtPayload(token);
  const email = typeof payload.email === "string" ? payload.email : "google-user@forma.local";
  const name = typeof payload.name === "string" ? payload.name : email.split("@")[0];
  const avatar = typeof payload.picture === "string" ? payload.picture : null;
  const provider = typeof payload.provider === "string" ? payload.provider : "google";
  return { email, name, avatar, provider };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const [, payload] = token.split(".");
    if (!payload) return {};
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(window.atob(padded)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getLocalProfile() {
  try {
    const stored = localStorage.getItem("forma_profile");
    if (!stored) return {};
    return JSON.parse(stored) as { name?: string; email?: string; avatar?: string | null };
  } catch {
    return {};
  }
}

function titleCase(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
