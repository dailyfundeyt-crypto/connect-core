export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      API: {
        Row: {
          created_at: string
          id: number
        }
        Insert: {
          created_at?: string
          id?: number
        }
        Update: {
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      article_comments: {
        Row: {
          article_id: string
          content: string
          created_at: string
          id: string
          parent_comment_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          article_id: string
          content: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          article_id?: string
          content?: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "article_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      article_templates: {
        Row: {
          author_name: string | null
          category: string | null
          category_en: string | null
          created_at: string
          id: string
          name: string
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          author_name?: string | null
          category?: string | null
          category_en?: string | null
          created_at?: string
          id?: string
          name: string
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          author_name?: string | null
          category?: string | null
          category_en?: string | null
          created_at?: string
          id?: string
          name?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      article_views: {
        Row: {
          article_id: string
          created_at: string
          id: string
          last_viewed_at: string | null
          updated_at: string
          view_count: number
        }
        Insert: {
          article_id: string
          created_at?: string
          id?: string
          last_viewed_at?: string | null
          updated_at?: string
          view_count?: number
        }
        Update: {
          article_id?: string
          created_at?: string
          id?: string
          last_viewed_at?: string | null
          updated_at?: string
          view_count?: number
        }
        Relationships: []
      }
      comment_notifications: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          is_read: boolean | null
          recipient_id: string
          updated_at: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          recipient_id: string
          updated_at?: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          recipient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "article_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_one_id: string
          user_two_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_one_id: string
          user_two_id: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_one_id?: string
          user_two_id?: string
        }
        Relationships: []
      }
      encryption_keys: {
        Row: {
          created_at: string | null
          encrypted_private_key: string | null
          id: string
          key_derivation_salt: string | null
          public_key: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          encrypted_private_key?: string | null
          id?: string
          key_derivation_salt?: string | null
          public_key: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          encrypted_private_key?: string | null
          id?: string
          key_derivation_salt?: string | null
          public_key?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          followed_user_id: string
          follower_id: string
          id: string
        }
        Insert: {
          created_at?: string
          followed_user_id: string
          follower_id: string
          id?: string
        }
        Update: {
          created_at?: string
          followed_user_id?: string
          follower_id?: string
          id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          article_data: Json | null
          attachment_url: string | null
          content: string
          conversation_id: string
          created_at: string
          delivered_at: string | null
          id: string
          is_encrypted: boolean | null
          is_read: boolean | null
          message_type: string | null
          sender_id: string
          updated_at: string
        }
        Insert: {
          article_data?: Json | null
          attachment_url?: string | null
          content: string
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_encrypted?: boolean | null
          is_read?: boolean | null
          message_type?: string | null
          sender_id: string
          updated_at?: string
        }
        Update: {
          article_data?: Json | null
          attachment_url?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_encrypted?: boolean | null
          is_read?: boolean | null
          message_type?: string | null
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_codes: {
        Row: {
          code: string
          created_at: string
          email: string
          expires_at: string
          id: string
          used: boolean | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          used?: boolean | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          used?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          alias: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          description: string | null
          display_name: string | null
          followers_count: number | null
          following_count: number | null
          id: string
          is_public: boolean | null
          last_alias_change: string | null
          last_name_change: string | null
          location: string | null
          profession: string | null
          profile_image_url: string | null
          profile_type: string | null
          profile_visibility: Json | null
          social_links: Json | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          alias?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          description?: string | null
          display_name?: string | null
          followers_count?: number | null
          following_count?: number | null
          id?: string
          is_public?: boolean | null
          last_alias_change?: string | null
          last_name_change?: string | null
          location?: string | null
          profession?: string | null
          profile_image_url?: string | null
          profile_type?: string | null
          profile_visibility?: Json | null
          social_links?: Json | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          alias?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          description?: string | null
          display_name?: string | null
          followers_count?: number | null
          following_count?: number | null
          id?: string
          is_public?: boolean | null
          last_alias_change?: string | null
          last_name_change?: string | null
          location?: string | null
          profession?: string | null
          profile_image_url?: string | null
          profile_type?: string | null
          profile_visibility?: Json | null
          social_links?: Json | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string | null
          id: string
          subscription: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          subscription: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          subscription?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      security_questions: {
        Row: {
          answer_hash: string
          created_at: string
          email: string
          id: string
          question: string
          user_id: string
        }
        Insert: {
          answer_hash: string
          created_at?: string
          email: string
          id?: string
          question: string
          user_id: string
        }
        Update: {
          answer_hash?: string
          created_at?: string
          email?: string
          id?: string
          question?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          ai_credits: number
          created_at: string | null
          has_ad_free: boolean
          has_video_player: boolean
          id: string
          image_upload_limit: number
          name: string
          price: number
          updated_at: string | null
        }
        Insert: {
          ai_credits?: number
          created_at?: string | null
          has_ad_free?: boolean
          has_video_player?: boolean
          id?: string
          image_upload_limit?: number
          name: string
          price?: number
          updated_at?: string | null
        }
        Update: {
          ai_credits?: number
          created_at?: string | null
          has_ad_free?: boolean
          has_video_player?: boolean
          id?: string
          image_upload_limit?: number
          name?: string
          price?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      user_articles: {
        Row: {
          author_name: string
          category: string
          category_en: string | null
          content: string
          content_en: string | null
          excerpt: string
          excerpt_en: string | null
          id: string
          image_url: string | null
          is_published: boolean | null
          published_at: string
          tags: string[] | null
          title: string
          title_en: string | null
          updated_at: string
          user_id: string
          video_url: string | null
          views: number | null
        }
        Insert: {
          author_name: string
          category: string
          category_en?: string | null
          content: string
          content_en?: string | null
          excerpt: string
          excerpt_en?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean | null
          published_at?: string
          tags?: string[] | null
          title: string
          title_en?: string | null
          updated_at?: string
          user_id: string
          video_url?: string | null
          views?: number | null
        }
        Update: {
          author_name?: string
          category?: string
          category_en?: string | null
          content?: string
          content_en?: string | null
          excerpt?: string
          excerpt_en?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean | null
          published_at?: string
          tags?: string[] | null
          title?: string
          title_en?: string | null
          updated_at?: string
          user_id?: string
          video_url?: string | null
          views?: number | null
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          activated_at: string | null
          ai_credits_remaining: number
          created_at: string | null
          expires_at: string | null
          id: string
          images_uploaded: number
          is_active: boolean
          plan_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          ai_credits_remaining?: number
          created_at?: string | null
          expires_at?: string | null
          id?: string
          images_uploaded?: number
          is_active?: boolean
          plan_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          activated_at?: string | null
          ai_credits_remaining?: number
          created_at?: string | null
          expires_at?: string | null
          id?: string
          images_uploaded?: number
          is_active?: boolean
          plan_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_profiles: {
        Row: {
          alias: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          description: string | null
          display_name: string | null
          followers_count: number | null
          following_count: number | null
          id: string | null
          is_public: boolean | null
          location: string | null
          profession: string | null
          website: string | null
        }
        Insert: {
          alias?: string | null
          avatar_url?: string | null
          bio?: never
          created_at?: string | null
          description?: never
          display_name?: string | null
          followers_count?: number | null
          following_count?: number | null
          id?: string | null
          is_public?: boolean | null
          location?: never
          profession?: never
          website?: never
        }
        Update: {
          alias?: string | null
          avatar_url?: string | null
          bio?: never
          created_at?: string | null
          description?: never
          display_name?: string | null
          followers_count?: number | null
          following_count?: number | null
          id?: string | null
          is_public?: boolean | null
          location?: never
          profession?: never
          website?: never
        }
        Relationships: []
      }
    }
    Functions: {
      can_send_media: {
        Args: { p_conversation_id: string; p_recipient_id: string }
        Returns: boolean
      }
      deduct_ai_credits: {
        Args: { p_amount: number; p_user_id: string }
        Returns: boolean
      }
      generate_unique_alias: { Args: never; Returns: string }
      get_article_view_count: {
        Args: { p_article_id: string }
        Returns: number
      }
      get_public_profile: {
        Args: { profile_user_id: string }
        Returns: {
          alias: string
          avatar_url: string
          bio: string
          created_at: string
          description: string
          display_name: string
          id: string
          is_public: boolean
          location: string
          profession: string
          updated_at: string
          user_id: string
          website: string
        }[]
      }
      get_safe_profile_view: {
        Args: { profile_user_id: string }
        Returns: {
          alias: string
          avatar_url: string
          bio: string
          created_at: string
          description: string
          display_name: string
          id: string
          is_public: boolean
          location: string
          profession: string
          website: string
        }[]
      }
      get_safe_public_profile: {
        Args: { profile_user_id: string }
        Returns: {
          alias: string
          avatar_url: string
          bio: string
          description: string
          display_name: string
          id: string
          location: string
          profession: string
          website: string
        }[]
      }
      get_user_ai_credits: { Args: { p_user_id: string }; Returns: number }
      has_active_pro_subscription: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      increment_article_view_count: {
        Args: { p_article_id: string }
        Returns: number
      }
      increment_article_views: {
        Args: { article_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
