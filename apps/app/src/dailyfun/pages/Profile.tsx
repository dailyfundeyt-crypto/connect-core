import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';
import { Avatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';
import { Button } from '../components/ui/button';
import { Loader2, MapPin, Calendar, Heart, ArrowLeft, MessageCircle } from 'lucide-react';
import InstallSidebar from '../components/InstallSidebar';
import { useAuth } from '../contexts/AuthContext';
import { useFollows } from '../hooks/useFollows';
import { toast } from 'sonner';
import ArticleCard from '../components/ArticleCard';
import ChatInterface from '../components/ChatInterface';

interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  location: string | null;
  profession: string | null;
  description: string | null;
  website: string | null;
  alias: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

const Profile = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { followedAuthors, refetchFollows } = useFollows();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [articles, setArticles] = useState<any[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchProfile(userId);
      fetchUserArticles(userId);
    }
  }, [userId]);

  const { followedUserIds } = useFollows();

  useEffect(() => {
    if (profile && profile.user_id) {
      setIsFollowing(followedUserIds.includes(profile.user_id));
    }
  }, [followedUserIds, profile]);

  const fetchProfile = async (id: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', id)
        .eq('is_public', true)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        toast.error('Fehler beim Laden des Profils');
        return;
      }

      if (!data) {
        toast.error('Profil nicht gefunden oder nicht öffentlich');
        return;
      }

      setProfile(data as UserProfile);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Fehler beim Laden des Profils');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserArticles = async (id: string) => {
    try {
      setArticlesLoading(true);
      const { data, error } = await supabase
        .from('user_articles')
        .select('*')
        .eq('user_id', id)
        .eq('is_published', true)
        .order('published_at', { ascending: false });

      if (error) {
        console.error('Error fetching articles:', error);
        return;
      }

      // Transform to match ArticleCard interface
      const transformedArticles = data?.map(article => ({
        id: article.id,
        title: article.title,
        titleEn: article.title_en,
        excerpt: article.excerpt,
        excerptEn: article.excerpt_en,
        author: article.author_name,
        publishedAt: article.published_at,
        category: article.category,
        categoryEn: article.category_en,
        imageUrl: article.image_url || '/placeholder.svg',
        views: article.views || 0
      })) || [];

      setArticles(transformedArticles);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setArticlesLoading(false);
    }
  };

  const handleFollowToggle = async () => {
    if (!user) {
      toast.error('Bitte loggen Sie sich ein, um zu folgen');
      return;
    }

    if (!profile?.user_id) {
      toast.error('Profil kann nicht gefolgt werden');
      return;
    }

    try {
      if (isFollowing) {
        // Unfollow
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('followed_user_id', profile.user_id);

        if (error) throw error;
      } else {
        // Follow
        const { error } = await supabase
          .from('follows')
          .insert({
            follower_id: user.id,
            followed_user_id: profile.user_id
          });

        if (error) throw error;
      }

      setIsFollowing(!isFollowing);
      await refetchFollows();
      
      // Refetch profile to get updated follower count
      if (userId) {
        await fetchProfile(userId);
      }
      
      toast.success(isFollowing ? 'Nicht mehr gefolgt' : 'Gefolgt!');
    } catch (error) {
      console.error('Error toggling follow:', error);
      toast.error('Fehler beim Folgen');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-red-accent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-white">
        <InstallSidebar />
        <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-16">
            <h2 className="text-2xl font-bold text-black mb-4">Profil nicht gefunden</h2>
            <p className="text-gray-600 mb-8">Das angeforderte Profil existiert nicht oder ist nicht öffentlich.</p>
            <Button onClick={() => navigate('/search')} className="bg-black text-white hover:bg-gray-800 rounded-full px-6 py-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück zur Suche
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Don't show profile if it's the current user - redirect to their own management page
  if (user && user.id === profile.user_id) {
    navigate('/weird');
    return null;
  }

  // Show chat interface if chat is open
  if (showChat && profile) {
    return (
      <ChatInterface
        recipientId={profile.user_id}
        recipientName={profile.display_name || 'Unbekannt'}
        recipientAvatar={profile.avatar_url}
        onClose={() => setShowChat(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <InstallSidebar />
      
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <div className="mb-8">
          <Button 
            onClick={() => navigate(-1)} 
            variant="ghost"
            className="text-gray-600 hover:text-black p-0"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        </div>

        {/* Profile Section */}
        <div className="text-center mb-8">
          {/* Avatar - Clickable to open chat */}
          <div className="flex justify-center mb-6">
            <div 
              className="relative group cursor-pointer"
              onClick={() => {
                if (!user) {
                  toast.error('Bitte melden Sie sich an, um Nachrichten zu senden');
                  return;
                }
                setShowChat(true);
              }}
            >
              <Avatar className="w-24 h-24 ring-4 ring-gray-100 group-hover:ring-primary/30 transition-all">
                <AvatarImage src={profile.avatar_url || ''} />
                <AvatarFallback className="bg-gray-300 text-gray-600 text-3xl font-bold">
                  {(profile.display_name || 'U').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {/* Chat Icon Overlay */}
              <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <MessageCircle className="h-10 w-10 text-white" />
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex items-center justify-center gap-8 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-black">{articles.length}</div>
              <div className="text-sm text-gray-600">Artikel</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-black">
                {(profile as any).followers_count || 0}
              </div>
              <div className="text-sm text-gray-600">Follower</div>
            </div>
            
            {profile.location && (
              <div className="flex items-center gap-2 text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
                <MapPin className="h-4 w-4" />
                <span className="text-sm">{profile.location}</span>
              </div>
            )}
          </div>
          
          {/* Name */}
          <h2 className="text-xl font-bold text-black mb-1">
            {profile.display_name || 'Unbekannter Nutzer'}
          </h2>
          
          {/* Alias */}
          {profile.alias && (
            <p className="text-gray-500 text-sm mb-2">
              @{profile.alias}
            </p>
          )}
          
          {/* Profession as Link */}
          {profile.profession && (
            <div className="mb-3">
              {profile.website ? (
                <a 
                  href={profile.website} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-red-500 hover:underline font-medium"
                >
                  {profile.profession}
                </a>
              ) : (
                <p className="text-gray-700 font-medium">
                  {profile.profession}
                </p>
              )}
            </div>
          )}
          
          {/* Bio */}
          {profile.bio && (
            <p className="text-gray-700 mb-4 max-w-md mx-auto">
              {profile.bio}
            </p>
          )}
          
          {/* Website Link */}
          {profile.website && (
            <div className="mb-4">
              <a 
                href={profile.website} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-500 hover:underline text-sm"
              >
                Website besuchen
              </a>
            </div>
          )}
          
          {/* Join Date */}
          <div className="flex items-center justify-center gap-2 text-sm text-gray-600 mb-8">
            <Calendar className="h-4 w-4" />
            <span>
              Mitglied seit {new Date(profile.created_at).toLocaleDateString('de-DE', { 
                day: 'numeric', 
                month: 'numeric', 
                year: 'numeric' 
              })}
            </span>
          </div>
          
          {/* Follow Button */}
          {user && user.id !== profile.user_id && (
            <Button 
              onClick={handleFollowToggle}
              className={`rounded-full px-6 py-2 ${
                isFollowing 
                  ? 'bg-black text-white hover:bg-gray-800' 
                  : 'bg-white text-black border border-black hover:bg-gray-50'
              }`}
            >
              <Heart className={`h-4 w-4 mr-2 ${isFollowing ? 'fill-current' : ''}`} />
              {isFollowing ? 'Gefolgt' : 'Folgen'}
            </Button>
          )}
        </div>

        {/* Latest Articles Section */}
        <div className="text-center pt-4">
          <h3 className="text-xl font-bold text-black mb-2">Latest Articles</h3>
          <p className="text-gray-600 text-sm mb-6">by {profile.display_name}</p>
          
          {/* Articles Grid */}
          {articlesLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-red-accent" />
            </div>
          ) : articles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          ) : (
            <div className="py-16">
              <h4 className="text-lg font-semibold text-black mb-2">No articles found</h4>
              <p className="text-gray-500 text-sm">No articles by {profile.display_name}.</p>
            </div>
          )}
        </div>

        {/* Description Section (if available) */}
        {profile.description && (
          <div className="mt-8 p-6 bg-gray-50 rounded-lg">
            <h4 className="text-lg font-semibold text-black mb-3">Über mich</h4>
            <p className="text-gray-700 leading-relaxed">{profile.description}</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Profile;