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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      case_arguments: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          created_by_kind: Database["public"]["Enums"]["actor_kind"]
          id: string
          kind: string | null
          office_id: string
          review_status: Database["public"]["Enums"]["item_status"]
          side: Database["public"]["Enums"]["argument_side"]
          source_char_end: number | null
          source_char_start: number | null
          source_document_id: string | null
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_message_id: string | null
          source_page: number | null
          source_quote: string | null
          text: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          id?: string
          kind?: string | null
          office_id?: string
          review_status?: Database["public"]["Enums"]["item_status"]
          side?: Database["public"]["Enums"]["argument_side"]
          source_char_end?: number | null
          source_char_start?: number | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_message_id?: string | null
          source_page?: number | null
          source_quote?: string | null
          text: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          id?: string
          kind?: string | null
          office_id?: string
          review_status?: Database["public"]["Enums"]["item_status"]
          side?: Database["public"]["Enums"]["argument_side"]
          source_char_end?: number | null
          source_char_start?: number | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_message_id?: string | null
          source_page?: number | null
          source_quote?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_arguments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_arguments_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_arguments_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_arguments_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      case_deadlines: {
        Row: {
          article_number: string
          article_sha256: string
          article_text: string
          case_id: string
          created_at: string
          created_by: string | null
          created_by_kind: Database["public"]["Enums"]["actor_kind"]
          days: number
          holidays_reviewed: boolean
          id: string
          judgment_id: string
          kind: string
          last_day: string
          law_source_id: string
          office_id: string
          raw_last_day: string
          reminders: number[]
          review_status: Database["public"]["Enums"]["item_status"]
          source_kind: Database["public"]["Enums"]["source_kind"]
          start_basis: string
          start_date: string
          urgent: boolean
          version_id: string
        }
        Insert: {
          article_number: string
          article_sha256: string
          article_text: string
          case_id: string
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          days: number
          holidays_reviewed?: boolean
          id?: string
          judgment_id: string
          kind: string
          last_day: string
          law_source_id: string
          office_id?: string
          raw_last_day: string
          reminders?: number[]
          review_status?: Database["public"]["Enums"]["item_status"]
          source_kind?: Database["public"]["Enums"]["source_kind"]
          start_basis: string
          start_date: string
          urgent?: boolean
          version_id: string
        }
        Update: {
          article_number?: string
          article_sha256?: string
          article_text?: string
          case_id?: string
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          days?: number
          holidays_reviewed?: boolean
          id?: string
          judgment_id?: string
          kind?: string
          last_day?: string
          law_source_id?: string
          office_id?: string
          raw_last_day?: string
          reminders?: number[]
          review_status?: Database["public"]["Enums"]["item_status"]
          source_kind?: Database["public"]["Enums"]["source_kind"]
          start_basis?: string
          start_date?: string
          urgent?: boolean
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_deadlines_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_deadlines_judgment_id_fkey"
            columns: ["judgment_id"]
            isOneToOne: false
            referencedRelation: "judgments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_deadlines_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      case_facts: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          created_by_kind: Database["public"]["Enums"]["actor_kind"]
          date_precision: Database["public"]["Enums"]["date_precision"]
          date_text: string | null
          fact_date: string | null
          id: string
          office_id: string
          review_status: Database["public"]["Enums"]["item_status"]
          sort_order: number | null
          source_char_end: number | null
          source_char_start: number | null
          source_document_id: string | null
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_message_id: string | null
          source_page: number | null
          source_quote: string | null
          text: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          date_precision?: Database["public"]["Enums"]["date_precision"]
          date_text?: string | null
          fact_date?: string | null
          id?: string
          office_id?: string
          review_status?: Database["public"]["Enums"]["item_status"]
          sort_order?: number | null
          source_char_end?: number | null
          source_char_start?: number | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_message_id?: string | null
          source_page?: number | null
          source_quote?: string | null
          text: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          date_precision?: Database["public"]["Enums"]["date_precision"]
          date_text?: string | null
          fact_date?: string | null
          id?: string
          office_id?: string
          review_status?: Database["public"]["Enums"]["item_status"]
          sort_order?: number | null
          source_char_end?: number | null
          source_char_start?: number | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_message_id?: string | null
          source_page?: number | null
          source_quote?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_facts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_facts_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_facts_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_facts_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      case_parties: {
        Row: {
          case_id: string
          client_id: string | null
          created_at: string
          created_by: string | null
          created_by_kind: Database["public"]["Enums"]["actor_kind"]
          id: string
          is_our_client: boolean
          name: string
          notes: string | null
          office_id: string
          representative: string | null
          review_status: Database["public"]["Enums"]["item_status"]
          role: Database["public"]["Enums"]["party_role"]
          source_char_end: number | null
          source_char_start: number | null
          source_document_id: string | null
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_message_id: string | null
          source_page: number | null
          source_quote: string | null
        }
        Insert: {
          case_id: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          id?: string
          is_our_client?: boolean
          name: string
          notes?: string | null
          office_id?: string
          representative?: string | null
          review_status?: Database["public"]["Enums"]["item_status"]
          role: Database["public"]["Enums"]["party_role"]
          source_char_end?: number | null
          source_char_start?: number | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_message_id?: string | null
          source_page?: number | null
          source_quote?: string | null
        }
        Update: {
          case_id?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          id?: string
          is_our_client?: boolean
          name?: string
          notes?: string | null
          office_id?: string
          representative?: string | null
          review_status?: Database["public"]["Enums"]["item_status"]
          role?: Database["public"]["Enums"]["party_role"]
          source_char_end?: number | null
          source_char_start?: number | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_message_id?: string | null
          source_page?: number | null
          source_quote?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_parties_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_parties_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_parties_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_parties_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_parties_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      case_requests: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          created_by_kind: Database["public"]["Enums"]["actor_kind"]
          id: string
          kind: string | null
          office_id: string
          review_status: Database["public"]["Enums"]["item_status"]
          source_char_end: number | null
          source_char_start: number | null
          source_document_id: string | null
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_message_id: string | null
          source_page: number | null
          source_quote: string | null
          text: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          id?: string
          kind?: string | null
          office_id?: string
          review_status?: Database["public"]["Enums"]["item_status"]
          source_char_end?: number | null
          source_char_start?: number | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_message_id?: string | null
          source_page?: number | null
          source_quote?: string | null
          text: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          id?: string
          kind?: string | null
          office_id?: string
          review_status?: Database["public"]["Enums"]["item_status"]
          source_char_end?: number | null
          source_char_start?: number | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_message_id?: string | null
          source_page?: number | null
          source_quote?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_requests_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_requests_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_requests_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_requests_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          case_number: string | null
          case_type: string | null
          case_year: number | null
          circuit: string | null
          client_id: string | null
          client_role: Database["public"]["Enums"]["party_role"] | null
          court: string | null
          created_at: string
          created_by: string | null
          created_by_kind: Database["public"]["Enums"]["actor_kind"]
          facts_date: string | null
          facts_date_precision: Database["public"]["Enums"]["date_precision"]
          id: string
          office_id: string
          previous_stage_case_id: string | null
          review_status: Database["public"]["Enums"]["item_status"]
          source_char_end: number | null
          source_char_start: number | null
          source_document_id: string | null
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_message_id: string | null
          source_page: number | null
          source_quote: string | null
          stage: Database["public"]["Enums"]["case_stage"]
          status: Database["public"]["Enums"]["case_status"]
          summary: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          case_number?: string | null
          case_type?: string | null
          case_year?: number | null
          circuit?: string | null
          client_id?: string | null
          client_role?: Database["public"]["Enums"]["party_role"] | null
          court?: string | null
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          facts_date?: string | null
          facts_date_precision?: Database["public"]["Enums"]["date_precision"]
          id?: string
          office_id?: string
          previous_stage_case_id?: string | null
          review_status?: Database["public"]["Enums"]["item_status"]
          source_char_end?: number | null
          source_char_start?: number | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_message_id?: string | null
          source_page?: number | null
          source_quote?: string | null
          stage?: Database["public"]["Enums"]["case_stage"]
          status?: Database["public"]["Enums"]["case_status"]
          summary?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          case_number?: string | null
          case_type?: string | null
          case_year?: number | null
          circuit?: string | null
          client_id?: string | null
          client_role?: Database["public"]["Enums"]["party_role"] | null
          court?: string | null
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          facts_date?: string | null
          facts_date_precision?: Database["public"]["Enums"]["date_precision"]
          id?: string
          office_id?: string
          previous_stage_case_id?: string | null
          review_status?: Database["public"]["Enums"]["item_status"]
          source_char_end?: number | null
          source_char_start?: number | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_message_id?: string | null
          source_page?: number | null
          source_quote?: string | null
          stage?: Database["public"]["Enums"]["case_stage"]
          status?: Database["public"]["Enums"]["case_status"]
          summary?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_previous_stage_case_id_fkey"
            columns: ["previous_stage_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_src_doc_fk"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachments: Json | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          office_id: string
          role: Database["public"]["Enums"]["chat_role"]
          sources: Json | null
          thread_id: string
          tool_calls: Json | null
        }
        Insert: {
          attachments?: Json | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          office_id?: string
          role: Database["public"]["Enums"]["chat_role"]
          sources?: Json | null
          thread_id: string
          tool_calls?: Json | null
        }
        Update: {
          attachments?: Json | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          office_id?: string
          role?: Database["public"]["Enums"]["chat_role"]
          sources?: Json | null
          thread_id?: string
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          case_id: string | null
          created_at: string
          created_by: string | null
          hearing_id: string | null
          id: string
          office_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          hearing_id?: string | null
          id?: string
          office_id?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          hearing_id?: string | null
          id?: string
          office_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_hearing_id_fkey"
            columns: ["hearing_id"]
            isOneToOne: false
            referencedRelation: "hearings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_turn_steps: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          office_id: string
          seq: number
          turn_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          office_id?: string
          seq: number
          turn_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          office_id?: string
          seq?: number
          turn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_turn_steps_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          created_by_kind: Database["public"]["Enums"]["actor_kind"]
          id: string
          kind: Database["public"]["Enums"]["client_kind"]
          name: string
          notes: string | null
          office_id: string
          phone: string | null
          review_status: Database["public"]["Enums"]["item_status"]
          source_char_end: number | null
          source_char_start: number | null
          source_document_id: string | null
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_message_id: string | null
          source_page: number | null
          source_quote: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          id?: string
          kind?: Database["public"]["Enums"]["client_kind"]
          name: string
          notes?: string | null
          office_id?: string
          phone?: string | null
          review_status?: Database["public"]["Enums"]["item_status"]
          source_char_end?: number | null
          source_char_start?: number | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_message_id?: string | null
          source_page?: number | null
          source_quote?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          id?: string
          kind?: Database["public"]["Enums"]["client_kind"]
          name?: string
          notes?: string | null
          office_id?: string
          phone?: string | null
          review_status?: Database["public"]["Enums"]["item_status"]
          source_char_end?: number | null
          source_char_start?: number | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_message_id?: string | null
          source_page?: number | null
          source_quote?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_src_doc_fk"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_briefs: {
        Row: {
          created_at: string
          for_date: string
          id: string
          office_id: string
          payload: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          for_date: string
          id?: string
          office_id?: string
          payload: Json
          user_id?: string
        }
        Update: {
          created_at?: string
          for_date?: string
          id?: string
          office_id?: string
          payload?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_briefs_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      dismissed_notices: {
        Row: {
          created_at: string
          id: string
          key: string
          kind: string
          office_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          kind: string
          office_id?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          kind?: string
          office_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dismissed_notices_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_column_cells: {
        Row: {
          answer: string | null
          column_id: string
          created_at: string
          created_by: string | null
          created_by_kind: Database["public"]["Enums"]["actor_kind"]
          document_id: string
          id: string
          note: string | null
          office_id: string
          review_status: Database["public"]["Enums"]["item_status"]
          source_char_end: number | null
          source_char_start: number | null
          source_document_id: string | null
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_page: number | null
          source_quote: string | null
        }
        Insert: {
          answer?: string | null
          column_id: string
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          document_id: string
          id?: string
          note?: string | null
          office_id?: string
          review_status?: Database["public"]["Enums"]["item_status"]
          source_char_end?: number | null
          source_char_start?: number | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_page?: number | null
          source_quote?: string | null
        }
        Update: {
          answer?: string | null
          column_id?: string
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          document_id?: string
          id?: string
          note?: string | null
          office_id?: string
          review_status?: Database["public"]["Enums"]["item_status"]
          source_char_end?: number | null
          source_char_start?: number | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_page?: number | null
          source_quote?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_column_cells_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "doc_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_column_cells_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_column_cells_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_column_cells_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_columns: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          created_by_kind: Database["public"]["Enums"]["actor_kind"]
          id: string
          office_id: string
          question: string
          review_status: Database["public"]["Enums"]["item_status"]
          source_kind: Database["public"]["Enums"]["source_kind"]
          title: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          id?: string
          office_id?: string
          question: string
          review_status?: Database["public"]["Enums"]["item_status"]
          source_kind?: Database["public"]["Enums"]["source_kind"]
          title: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          id?: string
          office_id?: string
          question?: string
          review_status?: Database["public"]["Enums"]["item_status"]
          source_kind?: Database["public"]["Enums"]["source_kind"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_columns_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_columns_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      document_pages: {
        Row: {
          created_at: string
          document_id: string
          id: string
          model: string | null
          office_id: string
          page_no: number
          text: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          model?: string | null
          office_id?: string
          page_no: number
          text?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          model?: string | null
          office_id?: string
          page_no?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_pages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_pages_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          case_id: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          created_by_kind: Database["public"]["Enums"]["actor_kind"]
          doc_date: string | null
          doc_type: Database["public"]["Enums"]["doc_type"]
          file_name: string
          id: string
          mime_type: string
          office_id: string
          page_count: number | null
          read_error: string | null
          read_status: Database["public"]["Enums"]["read_status"]
          review_status: Database["public"]["Enums"]["item_status"]
          size_bytes: number | null
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_message_id: string | null
          storage_path: string
          thread_id: string | null
          title: string | null
        }
        Insert: {
          case_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          doc_date?: string | null
          doc_type?: Database["public"]["Enums"]["doc_type"]
          file_name: string
          id?: string
          mime_type: string
          office_id?: string
          page_count?: number | null
          read_error?: string | null
          read_status?: Database["public"]["Enums"]["read_status"]
          review_status?: Database["public"]["Enums"]["item_status"]
          size_bytes?: number | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_message_id?: string | null
          storage_path: string
          thread_id?: string | null
          title?: string | null
        }
        Update: {
          case_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          doc_date?: string | null
          doc_type?: Database["public"]["Enums"]["doc_type"]
          file_name?: string
          id?: string
          mime_type?: string
          office_id?: string
          page_count?: number | null
          read_error?: string | null
          read_status?: Database["public"]["Enums"]["read_status"]
          review_status?: Database["public"]["Enums"]["item_status"]
          size_bytes?: number | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_message_id?: string | null
          storage_path?: string
          thread_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      hearings: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          created_by_kind: Database["public"]["Enums"]["actor_kind"]
          decided_at: string | null
          decision_created_by_kind:
            | Database["public"]["Enums"]["actor_kind"]
            | null
          decision_source_char_end: number | null
          decision_source_char_start: number | null
          decision_source_document_id: string | null
          decision_source_kind:
            | Database["public"]["Enums"]["source_kind"]
            | null
          decision_source_message_id: string | null
          decision_source_page: number | null
          decision_source_quote: string | null
          decision_text: string | null
          decision_type: Database["public"]["Enums"]["hearing_decision"] | null
          hearing_date: string
          id: string
          location: string | null
          next_hearing_id: string | null
          next_requirements: string | null
          office_id: string
          previous_hearing_id: string | null
          purpose: string | null
          review_status: Database["public"]["Enums"]["item_status"]
          source_char_end: number | null
          source_char_start: number | null
          source_document_id: string | null
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_message_id: string | null
          source_page: number | null
          source_quote: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          decided_at?: string | null
          decision_created_by_kind?:
            | Database["public"]["Enums"]["actor_kind"]
            | null
          decision_source_char_end?: number | null
          decision_source_char_start?: number | null
          decision_source_document_id?: string | null
          decision_source_kind?:
            | Database["public"]["Enums"]["source_kind"]
            | null
          decision_source_message_id?: string | null
          decision_source_page?: number | null
          decision_source_quote?: string | null
          decision_text?: string | null
          decision_type?: Database["public"]["Enums"]["hearing_decision"] | null
          hearing_date: string
          id?: string
          location?: string | null
          next_hearing_id?: string | null
          next_requirements?: string | null
          office_id?: string
          previous_hearing_id?: string | null
          purpose?: string | null
          review_status?: Database["public"]["Enums"]["item_status"]
          source_char_end?: number | null
          source_char_start?: number | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_message_id?: string | null
          source_page?: number | null
          source_quote?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          decided_at?: string | null
          decision_created_by_kind?:
            | Database["public"]["Enums"]["actor_kind"]
            | null
          decision_source_char_end?: number | null
          decision_source_char_start?: number | null
          decision_source_document_id?: string | null
          decision_source_kind?:
            | Database["public"]["Enums"]["source_kind"]
            | null
          decision_source_message_id?: string | null
          decision_source_page?: number | null
          decision_source_quote?: string | null
          decision_text?: string | null
          decision_type?: Database["public"]["Enums"]["hearing_decision"] | null
          hearing_date?: string
          id?: string
          location?: string | null
          next_hearing_id?: string | null
          next_requirements?: string | null
          office_id?: string
          previous_hearing_id?: string | null
          purpose?: string | null
          review_status?: Database["public"]["Enums"]["item_status"]
          source_char_end?: number | null
          source_char_start?: number | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_message_id?: string | null
          source_page?: number | null
          source_quote?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hearings_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hearings_decision_source_document_id_fkey"
            columns: ["decision_source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hearings_decision_source_message_id_fkey"
            columns: ["decision_source_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hearings_next_hearing_id_fkey"
            columns: ["next_hearing_id"]
            isOneToOne: false
            referencedRelation: "hearings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hearings_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hearings_previous_hearing_id_fkey"
            columns: ["previous_hearing_id"]
            isOneToOne: false
            referencedRelation: "hearings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hearings_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hearings_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      holiday_reports: {
        Row: {
          created_at: string
          created_by: string
          decided_at: string | null
          decided_by: string | null
          holiday_date: string
          id: string
          name: string
          note: string | null
          office_id: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          decided_at?: string | null
          decided_by?: string | null
          holiday_date: string
          id?: string
          name: string
          note?: string | null
          office_id?: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          decided_at?: string | null
          decided_by?: string | null
          holiday_date?: string
          id?: string
          name?: string
          note?: string | null
          office_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "holiday_reports_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          holiday_date: string
          id: string
          name: string
          note: string | null
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          holiday_date: string
          id?: string
          name: string
          note?: string | null
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          holiday_date?: string
          id?: string
          name?: string
          note?: string | null
          status?: string
        }
        Relationships: []
      }
      judgments: {
        Row: {
          appeal_deadline: string | null
          appeal_deadline_note: string | null
          case_id: string
          created_at: string
          created_by: string | null
          created_by_kind: Database["public"]["Enums"]["actor_kind"]
          hearing_id: string | null
          id: string
          judgment_date: string | null
          kind: Database["public"]["Enums"]["judgment_kind"]
          office_id: string
          operative_text: string
          outcome: string | null
          review_status: Database["public"]["Enums"]["item_status"]
          source_char_end: number | null
          source_char_start: number | null
          source_document_id: string | null
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_message_id: string | null
          source_page: number | null
          source_quote: string | null
        }
        Insert: {
          appeal_deadline?: string | null
          appeal_deadline_note?: string | null
          case_id: string
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          hearing_id?: string | null
          id?: string
          judgment_date?: string | null
          kind?: Database["public"]["Enums"]["judgment_kind"]
          office_id?: string
          operative_text: string
          outcome?: string | null
          review_status?: Database["public"]["Enums"]["item_status"]
          source_char_end?: number | null
          source_char_start?: number | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_message_id?: string | null
          source_page?: number | null
          source_quote?: string | null
        }
        Update: {
          appeal_deadline?: string | null
          appeal_deadline_note?: string | null
          case_id?: string
          created_at?: string
          created_by?: string | null
          created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          hearing_id?: string | null
          id?: string
          judgment_date?: string | null
          kind?: Database["public"]["Enums"]["judgment_kind"]
          office_id?: string
          operative_text?: string
          outcome?: string | null
          review_status?: Database["public"]["Enums"]["item_status"]
          source_char_end?: number | null
          source_char_start?: number | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_message_id?: string | null
          source_page?: number | null
          source_quote?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "judgments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judgments_hearing_id_fkey"
            columns: ["hearing_id"]
            isOneToOne: false
            referencedRelation: "hearings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judgments_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judgments_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judgments_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_calls: {
        Row: {
          cost_usd: number
          created_at: string
          document_id: string | null
          error: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model: string
          office_id: string | null
          ok: boolean
          output_tokens: number | null
          provider: string
          purpose: string
          thread_id: string | null
          user_id: string | null
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          document_id?: string | null
          error?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          office_id?: string | null
          ok: boolean
          output_tokens?: number | null
          provider: string
          purpose: string
          thread_id?: string | null
          user_id?: string | null
        }
        Update: {
          cost_usd?: number
          created_at?: string
          document_id?: string | null
          error?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          office_id?: string | null
          ok?: boolean
          output_tokens?: number | null
          provider?: string
          purpose?: string
          thread_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_calls_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      office_members: {
        Row: {
          created_at: string
          display_name: string | null
          office_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          office_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          office_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_members_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      offices: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      proposal_events: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          id: string
          office_id: string
          op_ids: string[]
          proposal_id: string
          undo_data: Json | null
          undoes_event_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          id?: string
          office_id?: string
          op_ids: string[]
          proposal_id: string
          undo_data?: Json | null
          undoes_event_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          id?: string
          office_id?: string
          op_ids?: string[]
          proposal_id?: string
          undo_data?: Json | null
          undoes_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_events_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_events_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_events_undoes_event_id_fkey"
            columns: ["undoes_event_id"]
            isOneToOne: false
            referencedRelation: "proposal_events"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          case_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          document_id: string | null
          id: string
          message_id: string | null
          office_id: string
          ops: Json
          status: Database["public"]["Enums"]["proposal_status"]
          thread_id: string | null
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          document_id?: string | null
          id?: string
          message_id?: string | null
          office_id?: string
          ops: Json
          status?: Database["public"]["Enums"]["proposal_status"]
          thread_id?: string | null
        }
        Update: {
          case_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          document_id?: string | null
          id?: string
          message_id?: string | null
          office_id?: string
          ops?: Json
          status?: Database["public"]["Enums"]["proposal_status"]
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          created_at: string
          created_by: string
          dismissed_at: string | null
          for_date: string
          id: string
          kind: string
          office_id: string
          remind_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          dismissed_at?: string | null
          for_date: string
          id?: string
          kind?: string
          office_id?: string
          remind_at: string
        }
        Update: {
          created_at?: string
          created_by?: string
          dismissed_at?: string | null
          for_date?: string
          id?: string
          kind?: string
          office_id?: string
          remind_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_office_id: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      record_hearing_decision: {
        Args: {
          p_created_by_kind?: Database["public"]["Enums"]["actor_kind"]
          p_decision: Database["public"]["Enums"]["hearing_decision"]
          p_decision_text?: string
          p_hearing_id: string
          p_next_date?: string
          p_next_requirements?: string
          p_source_char_end?: number
          p_source_char_start?: number
          p_source_document_id?: string
          p_source_kind?: Database["public"]["Enums"]["source_kind"]
          p_source_message_id?: string
          p_source_page?: number
          p_source_quote?: string
        }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      actor_kind: "lawyer" | "model"
      argument_side: "opponent" | "ours"
      case_stage: "first_instance" | "appeal" | "cassation"
      case_status:
        | "active"
        | "reserved_for_judgment"
        | "judged"
        | "suspended"
        | "closed"
      chat_role: "user" | "assistant" | "tool"
      client_kind: "person" | "company"
      date_precision: "day" | "month" | "year" | "unknown"
      doc_type:
        | "claim_sheet"
        | "contract"
        | "opponent_memo"
        | "our_memo"
        | "judgment"
        | "power_of_attorney"
        | "expert_report"
        | "evidence"
        | "correspondence"
        | "id_document"
        | "other"
      hearing_decision:
        | "postponed"
        | "reserved_for_judgment"
        | "judgment"
        | "struck_off"
        | "referred_to_expert"
        | "suspended"
        | "other"
      item_status: "suggested" | "confirmed" | "rejected"
      judgment_kind: "final" | "preliminary" | "interim"
      party_role:
        | "plaintiff"
        | "defendant"
        | "appellant"
        | "appellee"
        | "cassation_appellant"
        | "cassation_appellee"
        | "intervener"
        | "guarantor"
        | "witness"
        | "expert"
        | "other"
      proposal_status:
        | "pending"
        | "confirmed"
        | "partially_confirmed"
        | "rejected"
      read_status: "pending" | "reading" | "done" | "failed"
      source_kind: "chat" | "document" | "manual"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      actor_kind: ["lawyer", "model"],
      argument_side: ["opponent", "ours"],
      case_stage: ["first_instance", "appeal", "cassation"],
      case_status: [
        "active",
        "reserved_for_judgment",
        "judged",
        "suspended",
        "closed",
      ],
      chat_role: ["user", "assistant", "tool"],
      client_kind: ["person", "company"],
      date_precision: ["day", "month", "year", "unknown"],
      doc_type: [
        "claim_sheet",
        "contract",
        "opponent_memo",
        "our_memo",
        "judgment",
        "power_of_attorney",
        "expert_report",
        "evidence",
        "correspondence",
        "id_document",
        "other",
      ],
      hearing_decision: [
        "postponed",
        "reserved_for_judgment",
        "judgment",
        "struck_off",
        "referred_to_expert",
        "suspended",
        "other",
      ],
      item_status: ["suggested", "confirmed", "rejected"],
      judgment_kind: ["final", "preliminary", "interim"],
      party_role: [
        "plaintiff",
        "defendant",
        "appellant",
        "appellee",
        "cassation_appellant",
        "cassation_appellee",
        "intervener",
        "guarantor",
        "witness",
        "expert",
        "other",
      ],
      proposal_status: [
        "pending",
        "confirmed",
        "partially_confirmed",
        "rejected",
      ],
      read_status: ["pending", "reading", "done", "failed"],
      source_kind: ["chat", "document", "manual"],
    },
  },
} as const
