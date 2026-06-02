import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import { MFAEnrollment } from '@/components/auth/MFAEnrollment';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldAlert, LogOut, KeyRound } from 'lucide-react';

export default function MFASetupPage() {
  const { logout, user } = useAuth();

  return (
    <div className="min-h-screen bg-secondary flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-background via-background to-white">
      <div className="w-full max-w-2xl animate-in fade-in zoom-in duration-500">
        <div className="text-center mb-8 space-y-2">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-primary/10 ring-4 ring-white">
            <ShieldAlert className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Secure Your Account</h1>
          <p className="text-muted-foreground max-w-sm mx-auto">
            To protect our community and your data, we require multi-factor authentication (MFA) for all accounts.
          </p>
        </div>

        <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-xl ring-1 ring-slate-200/50 overflow-hidden">
          <CardContent className="p-0">
            <div className="grid md:grid-cols-5 h-full">
              {/* Left Side: Context */}
              <div className="md:col-span-2 bg-slate-900 p-8 text-white space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <KeyRound className="w-5 h-5 text-teal-400" />
                    How it works
                  </h3>
                  <ul className="space-y-4">
                    <li className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30 text-[10px] font-bold">1</div>
                      <p className="text-xs text-muted-foreground leading-relaxed">Install <b>Microsoft Authenticator</b> on your phone.</p>
                    </li>
                    <li className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30 text-[10px] font-bold">2</div>
                      <p className="text-xs text-muted-foreground leading-relaxed">Scan the QR code shown on the right.</p>
                    </li>
                    <li className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30 text-[10px] font-bold">3</div>
                      <p className="text-xs text-muted-foreground leading-relaxed">Enter the 6-digit code to verify and link your account.</p>
                    </li>
                  </ul>
                </div>

                <div className="pt-8 border-t border-slate-800">
                  <p className="text-[10px] text-muted-foreground leading-relaxed font-medium uppercase tracking-widest mb-2">Logged in as</p>
                  <p className="text-sm font-semibold text-teal-400 truncate">{user?.email}</p>
                </div>

                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-muted-foreground hover:text-white hover:bg-slate-800 p-0 h-auto py-2 text-xs"
                  onClick={logout}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out and exit
                </Button>
              </div>

              {/* Right Side: Setup Wizard */}
              <div className="md:col-span-3">
                <MFAEnrollment 
                  onComplete={() => {
                    // refreshMFAStatus called by enrollment component, 
                    // redirect handled by App.jsx interceptor
                  }}
                  onCancel={null} // MFA is mandatory
                />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <p className="text-center mt-8 text-muted-foreground text-[11px] font-medium uppercase tracking-widest">
          Restops Security Protocol &copy; 2026
        </p>
      </div>
    </div>
  );
}

