'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Activity, Wallet, Settings, BarChart3, TrendingUp } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const navItems = [
  {
    title: 'Live Feed',
    href: '/dashboard',
    icon: Activity,
    description: 'Real-time trading feed',
  },
  {
    title: 'Manage',
    href: '/dashboard/manage',
    icon: Settings,
    description: 'Configure bot settings',
  },
  {
    title: 'Wallets',
    href: '/dashboard/wallets',
    icon: Wallet,
    description: 'Manage your wallets',
  },
  {
    title: 'Analytics',
    href: '/dashboard/analytics',
    icon: BarChart3,
    description: 'Performance analytics',
    badge: 'Soon',
  },
];

interface DashboardNavProps {
  connected?: boolean;
}

export function DashboardNav({ connected = false }: DashboardNavProps) {
  const pathname = usePathname();

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

        {/* Footer */}
        <div className="border-t p-4">
          <p className="text-xs text-muted-foreground text-center">
            v1.0.0 • Copy Trading Bot
          </p>
        </div>
      </div>
    </aside>
  );
}
