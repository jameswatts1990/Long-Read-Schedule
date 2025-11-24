import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, Users, ClipboardCheck } from "lucide-react";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="max-w-4xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-foreground">
            Lab Team Scheduler
          </h1>
          <p className="text-xl text-muted-foreground">
            Organize your lab team's weekly tasks with ease
          </p>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="p-6 space-y-3">
            <Calendar className="w-10 h-10 text-primary" />
            <h3 className="font-semibold text-lg">Weekly Planning</h3>
            <p className="text-sm text-muted-foreground">
              Visualize your team's schedule across the work week with an intuitive calendar view
            </p>
          </Card>

          <Card className="p-6 space-y-3">
            <Users className="w-10 h-10 text-primary" />
            <h3 className="font-semibold text-lg">Team Management</h3>
            <p className="text-sm text-muted-foreground">
              Manage team members, assign tasks, and track batch numbers for lab work
            </p>
          </Card>

          <Card className="p-6 space-y-3">
            <ClipboardCheck className="w-10 h-10 text-primary" />
            <h3 className="font-semibold text-lg">Task Tracking</h3>
            <p className="text-sm text-muted-foreground">
              Add notes, dates, and batch information to keep detailed records
            </p>
          </Card>
        </div>

        {/* Login Button */}
        <div className="flex justify-center pt-4">
          <Button 
            size="lg" 
            onClick={handleLogin}
            className="px-8"
            data-testid="button-login"
          >
            Sign In to Continue
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Sign in with Google, GitHub, or email to access your lab schedule
        </p>
      </div>
    </div>
  );
}
