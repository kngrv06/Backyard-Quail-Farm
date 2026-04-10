import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, loginWithEmail, registerWithEmail, logout } from './firebase';
import Dashboard from './components/Dashboard';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Bird, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent<HTMLFormElement>, type: 'login' | 'register') => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      if (type === 'login') {
        await loginWithEmail(email, password);
      } else {
        await registerWithEmail(email, password);
      }
    } catch (error: any) {
      setAuthError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Bird className="h-12 w-12 animate-bounce text-stone-600" />
          <p className="font-medium text-stone-500">Loading Farm Data...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <AnimatePresence mode="wait">
        {!user ? (
          <motion.div
            key="login"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex h-screen items-center justify-center p-4"
          >
            <Card className="w-full max-w-md border-stone-200 shadow-xl">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-stone-100">
                  <Bird className="h-8 w-8 text-stone-600" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight">Backyard Quail Farm</CardTitle>
                <CardDescription>IoT Monitoring & Automation System</CardDescription>
              </CardHeader>
              <CardContent>
                <AnimatePresence mode="wait">
                  {authError && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mb-4 flex items-center gap-2 rounded-md bg-red-50 p-3 text-xs text-red-600 border border-red-100"
                    >
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <p>{authError}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={(e) => handleAuth(e, 'login')} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" name="email" type="email" placeholder="name@example.com" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" name="password" type="password" required />
                  </div>
                  <Button type="submit" className="w-full bg-stone-900 hover:bg-stone-800" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Sign In'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-4 md:p-8"
          >
            <Dashboard user={user} onLogout={logout} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
