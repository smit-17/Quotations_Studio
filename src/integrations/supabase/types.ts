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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      access_config: {
        Row: {
          bcrypt_hash: string | null
          id: number
          iterations: number
          password_hash: string
          salt: string
        }
        Insert: {
          bcrypt_hash?: string | null
          id?: number
          iterations: number
          password_hash: string
          salt: string
        }
        Update: {
          bcrypt_hash?: string | null
          id?: number
          iterations?: number
          password_hash?: string
          salt?: string
        }
        Relationships: []
      }
      access_sessions: {
        Row: {
          created_at: string
          expires_at: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          token_hash?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          attempted_at: string
          id: number
          ip: string
        }
        Insert: {
          attempted_at?: string
          id?: number
          ip: string
        }
        Update: {
          attempted_at?: string
          id?: number
          ip?: string
        }
        Relationships: []
      }
      quotation_rows: {
        Row: {
          cert_lab: string | null
          cert_no: string | null
          certificate: string
          clarity: string
          colour: string
          cps: string
          cut: string | null
          description: string
          fluorescence: string
          hsn: string
          id: string
          link: string
          pcs: string
          polish: string | null
          position: number
          price_per_ct: string
          quotation_id: string
          shape: string | null
          size: string
          size_unit: string
          stone: string | null
          symmetry: string | null
          total_wt: string | null
          type: string
          wt_per_pcs: string
        }
        Insert: {
          cert_lab?: string | null
          cert_no?: string | null
          certificate?: string
          clarity?: string
          colour?: string
          cps?: string
          cut?: string | null
          description?: string
          fluorescence?: string
          hsn?: string
          id: string
          link?: string
          pcs?: string
          polish?: string | null
          position: number
          price_per_ct?: string
          quotation_id: string
          shape?: string | null
          size?: string
          size_unit?: string
          stone?: string | null
          symmetry?: string | null
          total_wt?: string | null
          type?: string
          wt_per_pcs?: string
        }
        Update: {
          cert_lab?: string | null
          cert_no?: string | null
          certificate?: string
          clarity?: string
          colour?: string
          cps?: string
          cut?: string | null
          description?: string
          fluorescence?: string
          hsn?: string
          id?: string
          link?: string
          pcs?: string
          polish?: string | null
          position?: number
          price_per_ct?: string
          quotation_id?: string
          shape?: string | null
          size?: string
          size_unit?: string
          stone?: string | null
          symmetry?: string | null
          total_wt?: string | null
          type?: string
          wt_per_pcs?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_rows_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          company: Json | null
          created_at: string
          currency: string
          customer_address: string
          customer_name: string
          discount_type: string
          discount_value: string
          exchange_rate: string
          id: string
          other_charges: string
          other_label: string
          quotation_date: string
          quotation_number: string
          saved_as_draft: boolean
          secondary_currency: string
          seller_name: string
          shipping: string
          show_secondary: boolean
          terms: string
          updated_at: string
          version: number
        }
        Insert: {
          company?: Json | null
          created_at?: string
          currency?: string
          customer_address?: string
          customer_name?: string
          discount_type?: string
          discount_value?: string
          exchange_rate?: string
          id: string
          other_charges?: string
          other_label?: string
          quotation_date?: string
          quotation_number?: string
          saved_as_draft?: boolean
          secondary_currency?: string
          seller_name?: string
          shipping?: string
          show_secondary?: boolean
          terms?: string
          updated_at?: string
          version?: number
        }
        Update: {
          company?: Json | null
          created_at?: string
          currency?: string
          customer_address?: string
          customer_name?: string
          discount_type?: string
          discount_value?: string
          exchange_rate?: string
          id?: string
          other_charges?: string
          other_label?: string
          quotation_date?: string
          quotation_number?: string
          saved_as_draft?: boolean
          secondary_currency?: string
          seller_name?: string
          shipping?: string
          show_secondary?: boolean
          terms?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _session_ok: { Args: { p_token: string }; Returns: boolean }
      app_call: {
        Args: { p_action: string; p_data?: Json; p_token: string }
        Returns: Json
      }
      app_login: { Args: { p_password: string }; Returns: Json }
      save_quotation: {
        Args: {
          p_expected: number
          p_mark_draft: boolean
          p_q: Json
          p_rows: Json
        }
        Returns: number
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
    Enums: {},
  },
} as const
