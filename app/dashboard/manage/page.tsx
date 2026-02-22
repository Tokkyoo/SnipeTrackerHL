'use client';

import { useState } from 'react';
import { DashboardNav } from '@/components/dashboard-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Settings, Users, DollarSign, Shield, AlertTriangle } from 'lucide-react';

export default function ManagePage() {
  const [connected] = useState(false);

  return (
    <>
      <DashboardNav connected={connected} />
      <div className="ml-64 min-h-screen p-8 bg-background">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Manage</h1>
            <p className="text-muted-foreground">Configure your copy trading bot settings</p>
          </div>

          <Tabs defaultValue="risk" className="w-full">
            <TabsList>
              <TabsTrigger value="risk">
                <Shield className="h-4 w-4 mr-2" />
                Risk Management
              </TabsTrigger>
              <TabsTrigger value="traders">
                <Users className="h-4 w-4 mr-2" />
                Followed Traders
              </TabsTrigger>
              <TabsTrigger value="limits">
                <DollarSign className="h-4 w-4 mr-2" />
                Trading Limits
              </TabsTrigger>
              <TabsTrigger value="advanced">
                <Settings className="h-4 w-4 mr-2" />
                Advanced
              </TabsTrigger>
            </TabsList>

            <TabsContent value="risk" className="mt-6 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Risk Parameters</CardTitle>
                  <CardDescription>Configure risk limits and protection settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Current max notional: <strong>$2,000</strong> per position
                    </AlertDescription>
                  </Alert>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Max Position Size</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          placeholder="2000"
                          defaultValue="2000"
                        />
                        <span className="text-sm text-muted-foreground">USD</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Max Total Exposure</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          placeholder="10000"
                          defaultValue="10000"
                        />
                        <span className="text-sm text-muted-foreground">USD</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Max Leverage</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          placeholder="10"
                          defaultValue="10"
                        />
                        <span className="text-sm text-muted-foreground">x</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Stop Loss</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          placeholder="5"
                          defaultValue="5"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                  </div>

                  <Button className="w-full md:w-auto">Save Risk Settings</Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="traders" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Followed Traders</CardTitle>
                  <CardDescription>Manage traders you're copying</CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert>
                    <AlertDescription>
                      No traders configured yet. Add trader addresses to start copy trading.
                    </AlertDescription>
                  </Alert>
                  <Button className="mt-4">Add Trader</Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="limits" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Trading Limits</CardTitle>
                  <CardDescription>Set daily and per-trade limits</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Daily Trade Limit</label>
                      <input
                        type="number"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="50"
                        defaultValue="50"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Min Position Size</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          placeholder="100"
                          defaultValue="100"
                        />
                        <span className="text-sm text-muted-foreground">USD</span>
                      </div>
                    </div>
                  </div>

                  <Button className="w-full md:w-auto">Save Limits</Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="advanced" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Advanced Settings</CardTitle>
                  <CardDescription>Expert configuration options</CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert>
                    <AlertDescription>
                      Advanced settings coming soon...
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
