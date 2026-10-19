import { useEffect, useState } from 'react';
import { useAuth } from '@dailyfun/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@dailyfun/integrations/supabase/client';
import { Card } from '@dailyfun/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dailyfun/components/ui/tabs';
import { Eye, TrendingUp, TrendingDown, Users, FileText } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface AnalyticsData {
  totalViews: number;
  totalArticles: number;
  followers: number;
  following: number;
  viewsChange: number;
  articlesData: Array<{
    title: string;
    views: number;
    date: string;
  }>;
  viewsOverTime: Array<{
    date: string;
    views: number;
  }>;
}

const Analytics = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalViews: 0,
    totalArticles: 0,
    followers: 0,
    following: 0,
    viewsChange: 0,
    articlesData: [],
    viewsOverTime: []
  });

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    fetchAnalytics();
  }, [user]);

  const fetchAnalytics = async () => {
    if (!user) return;

    try {
      // Fetch profile data
      const { data: profile } = await supabase
        .from('profiles')
        .select('followers_count, following_count')
        .eq('user_id', user.id)
        .single();

      // Fetch user articles
      const { data: articles } = await supabase
        .from('user_articles')
        .select('id, title, views, published_at')
        .eq('user_id', user.id)
        .eq('is_published', true)
        .order('published_at', { ascending: false });

      const totalViews = articles?.reduce((sum, article) => sum + (article.views || 0), 0) || 0;
      const totalArticles = articles?.length || 0;

      // Create mock data for views over time (last 28 days)
      const viewsOverTime = Array.from({ length: 28 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (27 - i));
        return {
          date: date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
          views: Math.floor(Math.random() * 100) + 20
        };
      });

      setAnalytics({
        totalViews,
        totalArticles,
        followers: profile?.followers_count || 0,
        following: profile?.following_count || 0,
        viewsChange: -12, // Mock data
        articlesData: articles?.slice(0, 5).map(a => ({
          title: a.title,
          views: a.views || 0,
          date: new Date(a.published_at).toLocaleDateString('de-DE')
        })) || [],
        viewsOverTime
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Kanalanalysen</h1>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-muted">
            <TabsTrigger value="overview">Übersicht</TabsTrigger>
            <TabsTrigger value="content">Inhalte</TabsTrigger>
            <TabsTrigger value="audience">Zuschauer</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-6 bg-card hover:bg-accent/5 transition-colors">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Abonnenten</span>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-3xl font-bold">{analytics.followers.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">
                    {analytics.viewsChange > 0 ? '+' : ''}{analytics.viewsChange} in den letzten 28 Tagen
                  </p>
                </div>
              </Card>

              <Card className="p-6 bg-card hover:bg-accent/5 transition-colors">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Aufrufe</span>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-3xl font-bold">{analytics.totalViews.toLocaleString()}</p>
                  <div className="flex items-center text-xs text-destructive">
                    <TrendingDown className="h-3 w-3 mr-1" />
                    <span>134 weniger als gewöhnlich</span>
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-card hover:bg-accent/5 transition-colors">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Artikel</span>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-3xl font-bold">{analytics.totalArticles}</p>
                  <p className="text-xs text-muted-foreground">Veröffentlicht</p>
                </div>
              </Card>
            </div>

            {/* Chart */}
            <Card className="p-6 bg-card">
              <h3 className="text-lg font-semibold mb-4">
                Dein Kanal hat in den letzten 28 Tagen {analytics.viewsOverTime.reduce((sum, d) => sum + d.views, 0)} Aufrufe erzielt
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={analytics.viewsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="views" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            {/* Top Content */}
            <Card className="p-6 bg-card">
              <h3 className="text-lg font-semibold mb-4">Beliebteste Inhalte</h3>
              <div className="space-y-3">
                {analytics.articlesData.map((article, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium line-clamp-1">{article.title}</p>
                      <p className="text-sm text-muted-foreground">{article.date}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{article.views}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="content">
            <Card className="p-6 bg-card">
              <h3 className="text-lg font-semibold mb-4">Veröffentlichte Artikel</h3>
              <div className="space-y-4">
                {analytics.articlesData.map((article, index) => (
                  <div key={index} className="flex items-start gap-4 p-4 rounded-lg hover:bg-accent/5 transition-colors">
                    <div className="flex-1">
                      <h4 className="font-medium mb-1">{article.title}</h4>
                      <p className="text-sm text-muted-foreground">Veröffentlicht am {article.date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{article.views}</p>
                      <p className="text-xs text-muted-foreground">Aufrufe</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="audience">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-6 bg-card">
                <h3 className="text-lg font-semibold mb-4">Echtzeit</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-4xl font-bold">{Math.floor(Math.random() * 100)}</p>
                    <p className="text-sm text-muted-foreground">Aufrufe · Letzte 48 Stunden</p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-card">
                <h3 className="text-lg font-semibold mb-4">Abonnenten</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-4xl font-bold">{analytics.followers.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">Aktuelle Anzahl</p>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Analytics;
