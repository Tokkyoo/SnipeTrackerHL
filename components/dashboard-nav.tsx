'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, Wallet, Settings, BarChart3, TrendingUp, LogOut, User } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const navItems = [
  {
    title: 'Live Feed',
    href: '/dashboard',
    icon: Activity,
  },
  {
    title: 'Manage',
    href: '/dashboard/manage',
    icon: Settings,
  },
  {
    title: 'Wallets',
    href: '/dashboard/wallets',
    icon: Wallet,
  },
  {
    title: 'Analytics',
    href: '/dashboard/analytics',
    icon: BarChart3,
    badge: 'Soon',
  },
];

interface DashboardNavProps {
  connected?: boolean;
}

export function DashboardNav({ connected = false }: DashboardNavProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-background">
      <div className="flex h-full flex-col gap-2">
        {/* Logo */}
        <div className="flex h-16 items-center border-b px-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">HyTracker</span>
          </Link>
        </div>

        {/* Connection Status */}
        <div className="px-4 py-2">
          <Badge
            variant={connected ? 'default' : 'destructive'}
            className="w-full justify-center gap-2"
          >
            <div className={cn(
              'w-2 h-2 rounded-full',
              connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            )} />
            {connected ? 'Live' : 'Offline'}
          </Badge>
        </div>

        <Separator />

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  item.badge && 'pointer-events-none opacity-60'
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="flex-1">{item.title}</span>
                {item.badge && (
                  <Badge variant="outline" className="text-xs">
                    {item.badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Info + Sign Out */}
        <div className="border-t p-4 space-y-3">
          {session?.user && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {session.user.name || session.user.email}
                </p>
                {session.user.name && (
                  <p className="text-xs text-muted-foreground truncate">
                    {session.user.email}
                  </p>
                )}
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </aside>
  );
}
