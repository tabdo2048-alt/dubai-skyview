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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      communities: {
        Row: {
          center_lat: number | null
          center_lng: number | null
          created_at: string
          description: string | null
          hero_image_url: string | null
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          center_lat?: number | null
          center_lng?: number | null
          created_at?: string
          description?: string | null
          hero_image_url?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          center_lat?: number | null
          center_lng?: number | null
          created_at?: string
          description?: string | null
          hero_image_url?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      developers: {
        Row: {
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      hospitals: {
        Row: {
          created_at: string
          id: string
          images: string[]
          lat: number
          lng: number
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          images?: string[]
          lat: number
          lng: number
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          images?: string[]
          lat?: number
          lng?: number
          name?: string
        }
        Relationships: []
      }
      project_amenities: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          project_id: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          project_id: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_amenities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_images: {
        Row: {
          created_at: string
          id: string
          project_id: string
          sort_order: number
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          sort_order?: number
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_images_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_payment_plans: {
        Row: {
          created_at: string
          details: string | null
          id: string
          is_default: boolean
          label: string
          project_id: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          is_default?: boolean
          label: string
          project_id: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          is_default?: boolean
          label?: string
          project_id?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_payment_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_payment_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_payment_plan_installments: {
        Row: {
          created_at: string
          due_label: string | null
          due_type: string | null
          id: string
          label: string
          months: number | null
          payment_plan_id: string
          percentage: number
          sort_order: number
          stage: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_label?: string | null
          due_type?: string | null
          id?: string
          label: string
          months?: number | null
          payment_plan_id: string
          percentage: number
          sort_order?: number
          stage?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_label?: string | null
          due_type?: string | null
          id?: string
          label?: string
          months?: number | null
          payment_plan_id?: string
          percentage?: number
          sort_order?: number
          stage?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_payment_plan_installments_payment_plan_id_fkey"
            columns: ["payment_plan_id"]
            isOneToOne: false
            referencedRelation: "project_payment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_payment_plan_installments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_fees: {
        Row: {
          created_at: string
          fee_type: string
          id: string
          label: string
          project_id: string
          sort_order: number
          tenant_id: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          fee_type: string
          id?: string
          label: string
          project_id: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
          value: number
        }
        Update: {
          created_at?: string
          fee_type?: string
          id?: string
          label?: string
          project_id?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_fees_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_fees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_unit_types: {
        Row: {
          area_sqm_max: number | null
          area_sqm_min: number | null
          created_at: string
          floor_plan_url: string | null
          id: string
          label: string
          price_aed: number | null
          project_id: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          area_sqm_max?: number | null
          area_sqm_min?: number | null
          created_at?: string
          floor_plan_url?: string | null
          id?: string
          label: string
          price_aed?: number | null
          project_id: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          area_sqm_max?: number | null
          area_sqm_min?: number | null
          created_at?: string
          floor_plan_url?: string | null
          id?: string
          label?: string
          price_aed?: number | null
          project_id?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_unit_types_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_unit_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_unit_type_images: {
        Row: {
          created_at: string
          id: string
          is_floor_plan: boolean
          project_id: string
          sort_order: number
          tenant_id: string
          unit_type_id: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_floor_plan?: boolean
          project_id: string
          sort_order?: number
          tenant_id: string
          unit_type_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_floor_plan?: boolean
          project_id?: string
          sort_order?: number
          tenant_id?: string
          unit_type_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_unit_type_images_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_unit_type_images_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_unit_type_images_unit_type_id_fkey"
            columns: ["unit_type_id"]
            isOneToOne: false
            referencedRelation: "project_unit_types"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          bathrooms: number | null
          bedrooms_max: number | null
          bedrooms_min: number | null
          brochure_url: string | null
          category: string
          community_id: string | null
          completion_date: string | null
          created_at: string
          description: string | null
          developer_id: string | null
          featured: boolean
          id: string
          lat: number
          lng: number
          main_image_url: string | null
          name: string
          offer_accent_color: string | null
          offer_header_image_url: string | null
          offer_primary_color: string | null
          payment_plan: string | null
          plot_color: string | null
          plot_geometry: Json | null
          slug: string
          starting_price_aed: number | null
          status: string
          tags: string[]
          tour_360_url: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          address?: string | null
          bathrooms?: number | null
          bedrooms_max?: number | null
          bedrooms_min?: number | null
          brochure_url?: string | null
          category?: string
          community_id?: string | null
          completion_date?: string | null
          created_at?: string
          description?: string | null
          developer_id?: string | null
          featured?: boolean
          id?: string
          lat: number
          lng: number
          main_image_url?: string | null
          name: string
          offer_accent_color?: string | null
          offer_header_image_url?: string | null
          offer_primary_color?: string | null
          payment_plan?: string | null
          plot_color?: string | null
          plot_geometry?: Json | null
          slug: string
          starting_price_aed?: number | null
          status?: string
          tags?: string[]
          tour_360_url?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          address?: string | null
          bathrooms?: number | null
          bedrooms_max?: number | null
          bedrooms_min?: number | null
          brochure_url?: string | null
          category?: string
          community_id?: string | null
          completion_date?: string | null
          created_at?: string
          description?: string | null
          developer_id?: string | null
          featured?: boolean
          id?: string
          lat?: number
          lng?: number
          main_image_url?: string | null
          name?: string
          offer_accent_color?: string | null
          offer_header_image_url?: string | null
          offer_primary_color?: string | null
          payment_plan?: string | null
          plot_color?: string | null
          plot_geometry?: Json | null
          slug?: string
          starting_price_aed?: number | null
          status?: string
          tags?: string[]
          tour_360_url?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developers"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          created_at: string
          id: string
          images: string[]
          lat: number
          lng: number
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          images?: string[]
          lat: number
          lng: number
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          images?: string[]
          lat?: number
          lng?: number
          name?: string
        }
        Relationships: []
      }
      tourism: {
        Row: {
          created_at: string
          id: string
          images: string[]
          lat: number
          lng: number
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          images?: string[]
          lat: number
          lng: number
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          images?: string[]
          lat?: number
          lng?: number
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      zones: {
        Row: {
          category: string
          created_at: string
          geometry: Json
          id: string
          name: string
          value: number | null
        }
        Insert: {
          category: string
          created_at?: string
          geometry: Json
          id?: string
          name: string
          value?: number | null
        }
        Update: {
          category?: string
          created_at?: string
          geometry?: Json
          id?: string
          name?: string
          value?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_current_user_blocked: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
