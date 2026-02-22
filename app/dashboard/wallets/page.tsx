'use client';

import { useState } from 'react';
import { DashboardNav } from '@/components/dashboard-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Wallet, Plus, Copy, ExternalLink, Check } from 'lucide-react';

interface WalletData {
  address: string;
  name: string;
  balance: number;
  connected: boolean;
}

export default function WalletsPage() {
  const [connected] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  
  // Mock data - À remplacer par les vraies données
  const wallets: WalletData[] = [
    {
      address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      name: 'Trading Wallet',
      balance: 5420.50,
      connected: true,
    },
  ];

  const copyToClipboard = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <>
      <DashboardNav connected={connected} />
      <div className="ml-64 min-h-screen p-8 bg-background">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Wallets</h1>
              <p className="text-muted-foreground">Manage your trading wallets and balances</p>
            </div>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Wallet
            </Button>
          </div>

          {/* Balance Overview */}
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Balance</CardDescription>
                <CardTitle className="text-3xl text-blue-500">
                  ${wallets.reduce((sum, w) => sum + w.balance, 0).toFixed(2)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Across all wallets</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active Wallets</CardDescription>
                <CardTitle className="text-3xl text-green-500">
                  {wallets.filter(w => w.connected).length}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Connected and ready</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Available to Trade</CardDescription>
                <CardTitle className="text-3xl text-purple-500">
                  ${wallets.reduce((sum, w) => w.connected ? sum + w.balance : sum, 0).toFixed(2)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">In connected wallets</p>
              </CardContent>
            </Card>
          </div>

          {/* Wallets Table */}
          <Card>
            <CardHeader>
              <CardTitle>Your Wallets</CardTitle>
              <CardDescription>Manage and monitor your connected wallets</CardDescription>
            </CardHeader>
            <CardContent>
              {wallets.length === 0 ? (
                <Alert>
                  <Wallet className="h-4 w-4" />
                  <AlertDescription>
                    No wallets connected. Add a wallet to start trading.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Balance</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wallets.map((wallet, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{wallet.name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <code className="text-sm bg-secondary px-2 py-1 rounded">
                                {truncateAddress(wallet.address)}
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => copyToClipboard(wallet.address)}
                              >
                                {copiedAddress === wallet.address ? (
                                  <Check className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold">
                            ${wallet.balance.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={wallet.connected ? 'default' : 'secondary'}>
                              {wallet.connected ? 'Connected' : 'Disconnected'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="sm">
                                View Details
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline">
                  <Wallet className="h-4 w-4 mr-2" />
                  Connect Wallet
                </Button>
                <Button variant="outline">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View on Explorer
                </Button>
                <Button variant="outline">
                  Export Addresses
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
