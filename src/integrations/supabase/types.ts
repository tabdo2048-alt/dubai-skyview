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
      audit_logs: {
        Row: {
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          project_id: string | null
          session_id: string | null
          tenant_id: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          project_id?: string | null
          session_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          project_id?: string | null
          session_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communities_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      developers: {
        Row: {
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "developers_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      login_attempts: {
        Row: {
          created_at: string
          email: string | null
          id: number
          ip: string | null
          success: boolean
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: number
          ip?: string | null
          success?: boolean
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: number
          ip?: string | null
          success?: boolean
        }
        Relationships: []
      }
      login_rate_allowlist: {
        Row: {
          created_at: string
          ip: string
          note: string | null
        }
        Insert: {
          created_at?: string
          ip: string
          note?: string | null
        }
        Update: {
          created_at?: string
          ip?: string
          note?: string | null
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
          tenant_id: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          project_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          project_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_amenities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_amenities_tenant_fk"
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
      project_images: {
        Row: {
          content_hash: string | null
          created_at: string
          id: string
          project_id: string
          sort_order: number
          tenant_id: string
          url: string
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          id?: string
          project_id: string
          sort_order?: number
          tenant_id: string
          url: string
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          id?: string
          project_id?: string
          sort_order?: number
          tenant_id?: string
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
          {
            foreignKeyName: "project_images_tenant_fk"
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
      project_buildings: {
        Row: {
          created_at: string
          description: string | null
          floors_count: number | null
          id: string
          is_active: boolean
          name: string
          project_id: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          floors_count?: number | null
          id?: string
          is_active?: boolean
          name: string
          project_id: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          floors_count?: number | null
          id?: string
          is_active?: boolean
          name?: string
          project_id?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_buildings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_buildings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_unit_type_images: {
        Row: {
          content_hash: string | null
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
          content_hash?: string | null
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
          content_hash?: string | null
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
      project_unit_types: {
        Row: {
          area_sqm_max: number | null
          area_sqm_min: number | null
          availability: string
          bathrooms: number | null
          bedrooms: number | null
          building_id: string | null
          created_at: string
          floor: string | null
          floor_plan_url: string | null
          id: string
          label: string
          price_aed: number | null
          project_id: string
          sort_order: number
          tenant_id: string
          updated_at: string
          view_description: string | null
        }
        Insert: {
          area_sqm_max?: number | null
          area_sqm_min?: number | null
          availability?: string
          bathrooms?: number | null
          bedrooms?: number | null
          building_id?: string | null
          created_at?: string
          floor?: string | null
          floor_plan_url?: string | null
          id?: string
          label: string
          price_aed?: number | null
          project_id: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
          view_description?: string | null
        }
        Update: {
          area_sqm_max?: number | null
          area_sqm_min?: number | null
          availability?: string
          bathrooms?: number | null
          bedrooms?: number | null
          building_id?: string | null
          created_at?: string
          floor?: string | null
          floor_plan_url?: string | null
          id?: string
          label?: string
          price_aed?: number | null
          project_id?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          view_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_unit_types_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "project_buildings"
            referencedColumns: ["id"]
          },
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
          is_public: boolean
          lat: number
          lng: number
          main_image_url: string | null
          model_3d_altitude: number
          model_3d_enabled: boolean
          model_3d_lat: number | null
          model_3d_lng: number | null
          model_3d_rotation: number
          model_3d_scale: number
          model_3d_url: string | null
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
          tenant_id: string
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
          is_public?: boolean
          lat: number
          lng: number
          main_image_url?: string | null
          model_3d_altitude?: number
          model_3d_enabled?: boolean
          model_3d_lat?: number | null
          model_3d_lng?: number | null
          model_3d_rotation?: number
          model_3d_scale?: number
          model_3d_url?: string | null
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
          tenant_id: string
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
          is_public?: boolean
          lat?: number
          lng?: number
          main_image_url?: string | null
          model_3d_altitude?: number
          model_3d_enabled?: boolean
          model_3d_lat?: number | null
          model_3d_lng?: number | null
          model_3d_rotation?: number
          model_3d_scale?: number
          model_3d_url?: string | null
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
          tenant_id?: string
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
          {
            foreignKeyName: "projects_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      stripe_events: {
        Row: {
          event_id: string
          received_at: string
          type: string
        }
        Insert: {
          event_id: string
          received_at?: string
          type: string
        }
        Update: {
          event_id?: string
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          current_period_end: string | null
          data_purged_at: string | null
          id: string
          last_stripe_event_at: string | null
          name: string
          plan: string | null
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          suspended: boolean
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          data_purged_at?: string | null
          id?: string
          last_stripe_event_at?: string | null
          name: string
          plan?: string | null
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          suspended?: boolean
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          data_purged_at?: string | null
          id?: string
          last_stripe_event_at?: string | null
          name?: string
          plan?: string | null
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          suspended?: boolean
        }
        Relationships: []
      }
      tour_floors: {
        Row: {
          created_at: string
          floor_number: number | null
          floor_plan_url: string | null
          height: number | null
          id: string
          name: string
          sort_order: number
          tour_id: string
          updated_at: string
          width: number | null
        }
        Insert: {
          created_at?: string
          floor_number?: number | null
          floor_plan_url?: string | null
          height?: number | null
          id?: string
          name: string
          sort_order?: number
          tour_id: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          created_at?: string
          floor_number?: number | null
          floor_plan_url?: string | null
          height?: number | null
          id?: string
          name?: string
          sort_order?: number
          tour_id?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_floors_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "virtual_tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_hotspots: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          label: string | null
          metadata: Json
          pitch: number
          scene_id: string
          sort_order: number
          target_scene_id: string | null
          type: string
          updated_at: string
          yaw: number
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          label?: string | null
          metadata?: Json
          pitch: number
          scene_id: string
          sort_order?: number
          target_scene_id?: string | null
          type: string
          updated_at?: string
          yaw: number
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          label?: string | null
          metadata?: Json
          pitch?: number
          scene_id?: string
          sort_order?: number
          target_scene_id?: string | null
          type?: string
          updated_at?: string
          yaw?: number
        }
        Relationships: [
          {
            foreignKeyName: "tour_hotspots_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "tour_scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_hotspots_target_scene_id_fkey"
            columns: ["target_scene_id"]
            isOneToOne: false
            referencedRelation: "tour_scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_scenes: {
        Row: {
          created_at: string
          description: string | null
          floor_id: string | null
          floor_plan_x: number | null
          floor_plan_y: number | null
          id: string
          initial_hfov: number | null
          initial_pitch: number
          initial_yaw: number
          is_published: boolean
          multires_config: Json | null
          name: string
          panorama_type: string
          panorama_url: string
          sort_order: number
          thumbnail_url: string | null
          tour_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          floor_id?: string | null
          floor_plan_x?: number | null
          floor_plan_y?: number | null
          id?: string
          initial_hfov?: number | null
          initial_pitch?: number
          initial_yaw?: number
          is_published?: boolean
          multires_config?: Json | null
          name: string
          panorama_type?: string
          panorama_url: string
          sort_order?: number
          thumbnail_url?: string | null
          tour_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          floor_id?: string | null
          floor_plan_x?: number | null
          floor_plan_y?: number | null
          id?: string
          initial_hfov?: number | null
          initial_pitch?: number
          initial_yaw?: number
          is_published?: boolean
          multires_config?: Json | null
          name?: string
          panorama_type?: string
          panorama_url?: string
          sort_order?: number
          thumbnail_url?: string | null
          tour_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_scenes_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "tour_floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_scenes_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "virtual_tours"
            referencedColumns: ["id"]
          },
        ]
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
      user_blocks: {
        Row: {
          blocked_at: string
          blocked_by: string | null
          user_id: string
        }
        Insert: {
          blocked_at?: string
          blocked_by?: string | null
          user_id: string
        }
        Update: {
          blocked_at?: string
          blocked_by?: string | null
          user_id?: string
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
      virtual_tours: {
        Row: {
          building_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_published: boolean
          name: string
          project_id: string
          tenant_id: string
          thumbnail_url: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          building_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_published?: boolean
          name: string
          project_id: string
          tenant_id: string
          thumbnail_url?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          building_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_published?: boolean
          name?: string
          project_id?: string
          tenant_id?: string
          thumbnail_url?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "virtual_tours_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "project_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_tours_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_tours_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_tours_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "project_unit_types"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          category: string
          created_at: string
          geometry: Json
          id: string
          name: string
          tenant_id: string
          value: number | null
        }
        Insert: {
          category: string
          created_at?: string
          geometry: Json
          id?: string
          name: string
          tenant_id: string
          value?: number | null
        }
        Update: {
          category?: string
          created_at?: string
          geometry?: Json
          id?: string
          name?: string
          tenant_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "zones_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_virtual_tour: { Args: { _tour_id: string }; Returns: boolean }
      can_manage_virtual_tour_scene: {
        Args: { _scene_id: string }
        Returns: boolean
      }
      check_login_rate: { Args: never; Returns: undefined }
      client_ip: { Args: never; Returns: string }
      create_tenant_for_owner: { Args: { _name: string }; Returns: string }
      current_tenant_ids: { Args: never; Returns: string[] }
      current_user_has_lifetime_access: { Args: never; Returns: boolean }
      current_user_is_platform_owner: { Args: never; Returns: boolean }
      expire_my_subscriptions: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_current_user_blocked: { Args: never; Returns: boolean }
      is_platform_owner: { Args: { _user?: string }; Returns: boolean }
      is_suspend_override: { Args: { _user?: string }; Returns: boolean }
      is_tenant_member: {
        Args: { _min: Database["public"]["Enums"]["tenant_role"]; _tid: string }
        Returns: boolean
      }
      mark_tenant_data_purged: { Args: { _tenant: string }; Returns: undefined }
      platform_delete_user: { Args: { _uid: string }; Returns: undefined }
      platform_list_tenants: {
        Args: never
        Returns: {
          can_suspend_platform_admins: boolean
          created_at: string
          current_period_end: string
          has_platform_admin: boolean
          id: string
          name: string
          owner_email: string
          plan: string
          project_count: number
          slug: string
          subscription_status: string
          suspended: boolean
        }[]
      }
      platform_list_users: {
        Args: never
        Returns: {
          blocked: boolean
          can_block_platform_admins: boolean
          created_at: string
          current_period_end: string
          email: string
          is_platform_admin: boolean
          org_roles: string
          orgs: string
          subscription_status: string
          user_id: string
        }[]
      }
      platform_media_missing_thumbnails: {
        Args: { batch_limit?: number }
        Returns: {
          object_path: string
          size_bytes: number
        }[]
      }
      platform_media_storage_overview: { Args: never; Returns: Json }
      platform_set_suspended: {
        Args: { _suspended: boolean; _tenant: string }
        Returns: undefined
      }
      platform_set_user_blocked: {
        Args: { _blocked: boolean; _uid: string }
        Returns: undefined
      }
      record_login_failure: { Args: { _email: string }; Returns: undefined }
      record_login_success: { Args: never; Returns: undefined }
      retention_tenants_due_for_purge: {
        Args: { _limit?: number }
        Returns: {
          tenant_id: string
        }[]
      }
      set_tenant_stripe_customer: {
        Args: { _customer: string; _tenant: string }
        Returns: undefined
      }
      virtual_tour_storage_object_can_manage: {
        Args: { _bucket_id: string; _object_name: string }
        Returns: boolean
      }
      virtual_tour_storage_object_can_read: {
        Args: { _bucket_id: string; _object_name: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      tenant_role: "owner" | "admin" | "member"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      tenant_role: ["owner", "admin", "member"],
    },
  },
} as const
