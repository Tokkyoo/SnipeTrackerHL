'use client';

import { useState } from 'react';
import { DashboardNav } from '@/components/dashboard-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Settings, DollarSign, Shield, AlertTriangle, Loader2, Check } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { usePositions } from '@/hooks/use-positions';

export default function ManagePage() {
  const { isLive } = usePositions(5000);
  const { settings, updateSettings, isLoading } = useSettings();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [notionalCap, setNotionalCap] = useState<string>('');
  const [maxTotalNotional, setMaxTotalNotional] = useState<string>('');
  const [maxLeverage, setMaxLeverage] = useState<string>('');
  const [ratio, setRatio] = useState<string>('');

  // Sync form state when settings load
  const initialized = settings && notionalCap === '';
  if (initialized) {
    setNotionalCap(String(settings.notionalCap));
    setMaxTotalNotional(String(settings.maxTotalNotional));
    setMaxLeverage(String(settings.maxLeverage));
    setRatio(String(settings.ratio));
  }

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateSettings({
        notionalCap: parseFloat(notionalCap) || 200,
        maxTotalNotional: parseFloat(maxTotalNotional) || 2000,
        maxLeverage: parseFloat(maxLeverage) || 5,
        ratio: parseFloat(ratio) || 0.2,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
    setSaving(false);
  };

  return (
    <>
      <DashboardNav connected={isLive} />
      <div className="ml-64 min-h-screen p-8 bg-background">
        <div className="max-w-7xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Manage</h1>
            <p className="text-muted-foreground">Configure your tracking settings</p>
          </div>

          {isLoading ? (
            <div className="text-center py-16">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="risk" className="w-full">
              <TabsList>
                <TabsTrigger value="risk">
                  <Shield className="h-4 w-4 mr-2" />
                  Risk Management
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
                        Current max notional: <strong>${notionalCap || '200'}</strong> per position
                      </AlertDescription>
                    </Alert>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Max Position Size</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={notionalCap}
                            onChange={(e) => setNotionalCap(e.target.value)}
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
                            value={maxTotalNotional}
                            onChange={(e) => setMaxTotalNotional(e.target.value)}
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
                            value={maxLeverage}
                            onChange={(e) => setMaxLeverage(e.target.value)}
                          />
                          <span className="text-sm text-muted-foreground">x</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Copy Ratio</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={ratio}
                            onChange={(e) => setRatio(e.target.value)}
                          />
                          <span className="text-sm text-muted-foreground">ratio</span>
                        </div>
                      </div>
                    </div>

                    <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto">
                      {saving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : saved ? (
                        <Check className="h-4 w-4 mr-2 text-green-400" />
                      ) : null}
                      {saved ? 'Saved!' : 'Save Settings'}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="limits" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Trading Limits</CardTitle>
                    <CardDescription>Set daily and per-trade limits</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Alert>
                      <AlertDescription>
                        Trading limits are configured in the Risk Management tab above.
                      </AlertDescription>
                    </Alert>
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
          )}
        </div>
      </div>
    </>
  );
}
