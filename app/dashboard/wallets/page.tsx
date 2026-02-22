'use client';

import { useState } from 'react';
import { DashboardNav } from '@/components/dashboard-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Wallet, Plus, Copy, ExternalLink, Check, Trash2, Loader2 } from 'lucide-react';
import { useWallets } from '@/hooks/use-wallets';
import { usePositions } from '@/hooks/use-positions';

export default function WalletsPage() {
  const { wallets, addWallet, removeWallet, isLoading } = useWallets();
  const { isLive } = usePositions(5000);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const copyToClipboard = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleAdd = async () => {
    if (!newAddress.trim()) return;
    setAdding(true);
    setError('');
    try {
      await addWallet(newAddress.trim(), newNickname.trim() || undefined);
      setNewAddress('');
      setNewNickname('');
    } catch (err: any) {
      setError(err.message || 'Failed to add wallet');
    }
    setAdding(false);
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Remove this tracked wallet?')) return;
    try {
      await removeWallet(id);
    } catch {
      console.error('Failed to remove wallet');
    }
  };

  return (
    <>
      <DashboardNav connected={isLive} />
      <div className="ml-64 min-h-screen p-8 bg-background">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tracked Wallets</h1>
            <p className="text-muted-foreground">Manage the trader wallets you are tracking</p>
          </div>

          {/* Stats */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Tracked</CardDescription>
                <CardTitle className="text-3xl text-blue-500">
                  {wallets.length}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Wallets being monitored</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Status</CardDescription>
                <CardTitle className="text-3xl text-green-500">
                  {isLive ? 'Active' : 'Offline'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Polling every 3 seconds</p>
              </CardContent>
            </Card>
          </div>

          {/* Add Wallet */}
          <Card>
            <CardHeader>
              <CardTitle>Add Wallet</CardTitle>
              <CardDescription>Enter a Hyperliquid wallet address to start tracking</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Input
                  placeholder="0x... wallet address"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="font-mono flex-1"
                />
                <Input
                  placeholder="Nickname (optional)"
                  value={newNickname}
                  onChange={(e) => setNewNickname(e.target.value)}
                  className="w-48"
                />
                <Button onClick={handleAdd} disabled={!newAddress.trim() || adding}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  {adding ? '' : 'Add'}
                </Button>
              </div>
              {error && (
                <Alert variant="destructive" className="mt-3">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Wallets Table */}
          <Card>
            <CardHeader>
              <CardTitle>Your Tracked Wallets</CardTitle>
              <CardDescription>Manage wallets you are monitoring on Hyperliquid</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : wallets.length === 0 ? (
                <Alert>
                  <Wallet className="h-4 w-4" />
                  <AlertDescription>
                    No wallets tracked yet. Add a wallet address above to get started.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nickname</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Added</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wallets.map((wallet) => (
                        <TableRow key={wallet.id}>
                          <TableCell className="font-medium">
                            {wallet.nickname || '-'}
                          </TableCell>
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
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(wallet.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                asChild
                              >
                                <a
                                  href={`https://hypurrscan.io/address/${wallet.address}#txs`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => handleRemove(wallet.id)}
                              >
                                <Trash2 className="h-4 w-4" />
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
        </div>
      </div>
    </>
  );
}
