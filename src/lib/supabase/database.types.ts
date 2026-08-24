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
      bank_accounts: {
        Row: {
          account_number: string
          balance_as_of: string | null
          bank_name: string
          created_at: string
          current_balance: number
          department_id: string
          id: string
        }
        Insert: {
          account_number: string
          balance_as_of?: string | null
          bank_name: string
          created_at?: string
          current_balance?: number
          department_id: string
          id?: string
        }
        Update: {
          account_number?: string
          balance_as_of?: string | null
          bank_name?: string
          created_at?: string
          current_balance?: number
          department_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          category_id: string | null
          date: string
          department_id: string | null
          description: string | null
          direction: string
          external_ref: string | null
          id: string
          imported_at: string
          is_classified: boolean | null
        }
        Insert: {
          amount: number
          bank_account_id: string
          category_id?: string | null
          date: string
          department_id?: string | null
          description?: string | null
          direction: string
          external_ref?: string | null
          id?: string
          imported_at?: string
          is_classified?: boolean | null
        }
        Update: {
          amount?: number
          bank_account_id?: string
          category_id?: string | null
          date?: string
          department_id?: string | null
          description?: string | null
          direction?: string
          external_ref?: string | null
          id?: string
          imported_at?: string
          is_classified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_pending_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          is_split: boolean
          name: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          is_split?: boolean
          name: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          is_split?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      check_allocations: {
        Row: {
          amount: number
          check_id: string
          created_at: string
          department_id: string
          id: string
        }
        Insert: {
          amount: number
          check_id: string
          created_at?: string
          department_id: string
          id?: string
        }
        Update: {
          amount?: number
          check_id?: string
          created_at?: string
          department_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_allocations_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_allocations_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "v_checks_issued"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_allocations_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "v_checks_needing_issuance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_allocations_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "v_checks_pending_approval"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_allocations_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "v_pending_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_allocations_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "v_transfers_needing_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_allocations_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "v_transfers_pending_execution"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_allocations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      checks: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          bank_account_id: string
          category_id: string | null
          check_number: string | null
          cleared_at: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          due_date: string | null
          has_invoice: boolean
          id: string
          internal_beneficiary: string | null
          issued_at: string | null
          notes: string | null
          payee: string
          payment_method: string
          skip_department_ledger: boolean
          spread_id: string | null
          status: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id: string
          category_id?: string | null
          check_number?: string | null
          cleared_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          due_date?: string | null
          has_invoice?: boolean
          id?: string
          internal_beneficiary?: string | null
          issued_at?: string | null
          notes?: string | null
          payee: string
          payment_method?: string
          skip_department_ledger?: boolean
          spread_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id?: string
          category_id?: string | null
          check_number?: string | null
          cleared_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          due_date?: string | null
          has_invoice?: boolean
          id?: string
          internal_beneficiary?: string | null
          issued_at?: string | null
          notes?: string | null
          payee?: string
          payment_method?: string
          skip_department_ledger?: boolean
          spread_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "checks_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_pending_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_spread_id_fkey"
            columns: ["spread_id"]
            isOneToOne: false
            referencedRelation: "payment_spreads"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_commission_entries: {
        Row: {
          amount: number
          department_id: string
          id: string
          month: string
          qualifying_total: number
          updated_at: string
        }
        Insert: {
          amount?: number
          department_id: string
          id?: string
          month: string
          qualifying_total?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          department_id?: string
          id?: string
          month?: string
          qualifying_total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_commission_entries_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          created_at: string
          home_bank_account_id: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          home_bank_account_id: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          home_bank_account_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_home_bank_account_id_fkey"
            columns: ["home_bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      expected_incomes: {
        Row: {
          amount: number
          bank_account_id: string
          created_at: string
          created_by: string | null
          description: string | null
          expected_date: string
          id: string
          status: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expected_date: string
          id?: string
          status?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expected_date?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "expected_incomes_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      incomes: {
        Row: {
          amount: number
          bank_account_id: string
          category_id: string
          created_at: string
          created_by: string | null
          currency: string
          date: string
          donor_id_number: string | null
          donor_name: string | null
          id: string
          installment_current: number | null
          installment_total: number | null
          issuing_department_id: string
          notes: string | null
          order_ref: string | null
          owner_department_id: string
          payment_method: string | null
          raw_paste_data: Json | null
          receipt_number: string | null
          requires_inter_settlement: boolean
          skip_department_ledger: boolean
          status: string
          transaction_ref: string | null
          type_text: string | null
        }
        Insert: {
          amount: number
          bank_account_id: string
          category_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          date?: string
          donor_id_number?: string | null
          donor_name?: string | null
          id?: string
          installment_current?: number | null
          installment_total?: number | null
          issuing_department_id: string
          notes?: string | null
          order_ref?: string | null
          owner_department_id: string
          payment_method?: string | null
          raw_paste_data?: Json | null
          receipt_number?: string | null
          requires_inter_settlement?: boolean
          skip_department_ledger?: boolean
          status?: string
          transaction_ref?: string | null
          type_text?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string
          category_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          date?: string
          donor_id_number?: string | null
          donor_name?: string | null
          id?: string
          installment_current?: number | null
          installment_total?: number | null
          issuing_department_id?: string
          notes?: string | null
          order_ref?: string | null
          owner_department_id?: string
          payment_method?: string | null
          raw_paste_data?: Json | null
          receipt_number?: string | null
          requires_inter_settlement?: boolean
          skip_department_ledger?: boolean
          status?: string
          transaction_ref?: string | null
          type_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incomes_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_pending_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_issuing_department_id_fkey"
            columns: ["issuing_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_owner_department_id_fkey"
            columns: ["owner_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_department_ledger: {
        Row: {
          amount: number
          check_id: string | null
          created_at: string
          from_department_id: string
          id: string
          income_id: string | null
          manual_entry_id: string | null
          note: string | null
          settled_at: string | null
          settled_by: string | null
          status: string
          to_department_id: string
        }
        Insert: {
          amount: number
          check_id?: string | null
          created_at?: string
          from_department_id: string
          id?: string
          income_id?: string | null
          manual_entry_id?: string | null
          note?: string | null
          settled_at?: string | null
          settled_by?: string | null
          status?: string
          to_department_id: string
        }
        Update: {
          amount?: number
          check_id?: string | null
          created_at?: string
          from_department_id?: string
          id?: string
          income_id?: string | null
          manual_entry_id?: string | null
          note?: string | null
          settled_at?: string | null
          settled_by?: string | null
          status?: string
          to_department_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inter_department_ledger_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_department_ledger_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "v_checks_issued"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_department_ledger_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "v_checks_needing_issuance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_department_ledger_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "v_checks_pending_approval"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_department_ledger_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "v_pending_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_department_ledger_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "v_transfers_needing_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_department_ledger_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "v_transfers_pending_execution"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_department_ledger_from_department_id_fkey"
            columns: ["from_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_department_ledger_income_id_fkey"
            columns: ["income_id"]
            isOneToOne: false
            referencedRelation: "incomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_department_ledger_manual_entry_id_fkey"
            columns: ["manual_entry_id"]
            isOneToOne: false
            referencedRelation: "manual_department_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_department_ledger_to_department_id_fkey"
            columns: ["to_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_department_entries: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          bank_account_id: string
          created_at: string
          created_by: string | null
          department_id: string
          direction: string
          entry_date: string | null
          id: string
          notes: string | null
          recurring_period_date: string | null
          recurring_schedule_id: string | null
          status: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id: string
          created_at?: string
          created_by?: string | null
          department_id: string
          direction: string
          entry_date?: string | null
          id?: string
          notes?: string | null
          recurring_period_date?: string | null
          recurring_schedule_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id?: string
          created_at?: string
          created_by?: string | null
          department_id?: string
          direction?: string
          entry_date?: string | null
          id?: string
          notes?: string | null
          recurring_period_date?: string | null
          recurring_schedule_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_department_entries_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_department_entries_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_department_entries_recurring_schedule_id_fkey"
            columns: ["recurring_schedule_id"]
            isOneToOne: false
            referencedRelation: "recurring_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_spreads: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          internal_beneficiary: string | null
          notes: string | null
          payee: string
          payment_method: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          internal_beneficiary?: string | null
          notes?: string | null
          payee: string
          payment_method: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          internal_beneficiary?: string | null
          notes?: string | null
          payee?: string
          payment_method?: string
        }
        Relationships: []
      }
      print_queue: {
        Row: {
          created_at: string | null
          id: number
          label_data: Json
          printed_at: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: never
          label_data: Json
          printed_at?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: never
          label_data?: Json
          printed_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      recurring_schedule_allocations: {
        Row: {
          amount: number
          created_at: string
          department_id: string
          id: string
          schedule_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          department_id: string
          id?: string
          schedule_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          department_id?: string
          id?: string
          schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_schedule_allocations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_schedule_allocations_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "recurring_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_schedules: {
        Row: {
          bank_account_id: string | null
          category_id: string | null
          created_at: string
          day_of_month: number | null
          day_of_week: number | null
          department_id: string | null
          direction: string
          end_date: string | null
          expected_amount: number
          frequency: string
          id: string
          is_active: boolean
          name: string
          one_time_date: string | null
          type: string
        }
        Insert: {
          bank_account_id?: string | null
          category_id?: string | null
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          department_id?: string | null
          direction: string
          end_date?: string | null
          expected_amount: number
          frequency: string
          id?: string
          is_active?: boolean
          name: string
          one_time_date?: string | null
          type?: string
        }
        Update: {
          bank_account_id?: string | null
          category_id?: string | null
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          department_id?: string | null
          direction?: string
          end_date?: string | null
          expected_amount?: number
          frequency?: string
          id?: string
          is_active?: boolean
          name?: string
          one_time_date?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_schedules_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_schedules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_schedules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_pending_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_schedules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      user_department_access: {
        Row: {
          department_id: string
          granted_at: string
          granted_by: string | null
          user_id: string
        }
        Insert: {
          department_id: string
          granted_at?: string
          granted_by?: string | null
          user_id: string
        }
        Update: {
          department_id?: string
          granted_at?: string
          granted_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_department_access_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_department_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          can_set_check_dates: boolean
          created_at: string
          department_id: string | null
          full_name: string | null
          id: string
          role: string
        }
        Insert: {
          can_set_check_dates?: boolean
          created_at?: string
          department_id?: string | null
          full_name?: string | null
          id: string
          role?: string
        }
        Update: {
          can_set_check_dates?: boolean
          created_at?: string
          department_id?: string | null
          full_name?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_check_department_amounts: {
        Row: {
          amount: number | null
          approved_at: string | null
          bank_account_id: string | null
          check_id: string | null
          check_number: string | null
          department_id: string | null
          due_date: string | null
          payee: string | null
          payment_method: string | null
          skip_department_ledger: boolean | null
          spread_id: string | null
          status: string | null
        }
        Relationships: []
      }
      v_checks_issued: {
        Row: {
          account_number: string | null
          amount: number | null
          bank_account_id: string | null
          bank_name: string | null
          category_id: string | null
          check_number: string | null
          cleared_at: string | null
          created_at: string | null
          created_by: string | null
          department_id: string | null
          department_name: string | null
          due_date: string | null
          id: string | null
          internal_beneficiary: string | null
          issued_at: string | null
          notes: string | null
          payee: string | null
          payment_method: string | null
          skip_department_ledger: boolean | null
          spread_id: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checks_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_pending_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_spread_id_fkey"
            columns: ["spread_id"]
            isOneToOne: false
            referencedRelation: "payment_spreads"
            referencedColumns: ["id"]
          },
        ]
      }
      v_checks_needing_issuance: {
        Row: {
          account_number: string | null
          amount: number | null
          bank_account_id: string | null
          bank_name: string | null
          category_id: string | null
          check_number: string | null
          cleared_at: string | null
          created_at: string | null
          created_by: string | null
          department_id: string | null
          department_name: string | null
          due_date: string | null
          id: string | null
          internal_beneficiary: string | null
          notes: string | null
          payee: string | null
          payment_method: string | null
          skip_department_ledger: boolean | null
          spread_id: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checks_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_pending_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_spread_id_fkey"
            columns: ["spread_id"]
            isOneToOne: false
            referencedRelation: "payment_spreads"
            referencedColumns: ["id"]
          },
        ]
      }
      v_checks_pending_approval: {
        Row: {
          account_number: string | null
          amount: number | null
          bank_account_id: string | null
          bank_name: string | null
          category_id: string | null
          check_number: string | null
          cleared_at: string | null
          created_at: string | null
          created_by: string | null
          department_id: string | null
          department_name: string | null
          due_date: string | null
          id: string | null
          internal_beneficiary: string | null
          notes: string | null
          payee: string | null
          payment_method: string | null
          skip_department_ledger: boolean | null
          spread_id: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checks_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_pending_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_spread_id_fkey"
            columns: ["spread_id"]
            isOneToOne: false
            referencedRelation: "payment_spreads"
            referencedColumns: ["id"]
          },
        ]
      }
      v_inter_department_balances: {
        Row: {
          creditor_department_id: string | null
          debtor_department_id: string | null
          dept_a: string | null
          dept_b: string | null
          net_amount: number | null
        }
        Relationships: []
      }
      v_pending_categories: {
        Row: {
          created_at: string | null
          department_id: string | null
          id: string | null
          is_split: boolean | null
          name: string | null
        }
        Insert: {
          created_at?: string | null
          department_id?: string | null
          id?: string | null
          is_split?: boolean | null
          name?: string | null
        }
        Update: {
          created_at?: string | null
          department_id?: string | null
          id?: string | null
          is_split?: boolean | null
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      v_pending_checks: {
        Row: {
          account_number: string | null
          amount: number | null
          bank_account_id: string | null
          bank_name: string | null
          category_id: string | null
          check_number: string | null
          cleared_at: string | null
          created_at: string | null
          created_by: string | null
          department_id: string | null
          due_date: string | null
          id: string | null
          notes: string | null
          payee: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checks_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_pending_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      v_pending_queue_summary: {
        Row: {
          pending_amount: number | null
          pending_count: number | null
          source: string | null
        }
        Relationships: []
      }
      v_transfers_needing_verification: {
        Row: {
          account_number: string | null
          amount: number | null
          bank_account_id: string | null
          bank_name: string | null
          category_id: string | null
          check_number: string | null
          cleared_at: string | null
          created_at: string | null
          created_by: string | null
          department_id: string | null
          department_name: string | null
          due_date: string | null
          id: string | null
          internal_beneficiary: string | null
          notes: string | null
          payee: string | null
          payment_method: string | null
          skip_department_ledger: boolean | null
          spread_id: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checks_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_pending_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_spread_id_fkey"
            columns: ["spread_id"]
            isOneToOne: false
            referencedRelation: "payment_spreads"
            referencedColumns: ["id"]
          },
        ]
      }
      v_transfers_pending_execution: {
        Row: {
          account_number: string | null
          amount: number | null
          bank_account_id: string | null
          bank_name: string | null
          category_id: string | null
          check_number: string | null
          cleared_at: string | null
          created_at: string | null
          created_by: string | null
          department_id: string | null
          department_name: string | null
          due_date: string | null
          id: string | null
          internal_beneficiary: string | null
          notes: string | null
          payee: string | null
          payment_method: string | null
          skip_department_ledger: boolean | null
          spread_id: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checks_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_pending_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_spread_id_fkey"
            columns: ["spread_id"]
            isOneToOne: false
            referencedRelation: "payment_spreads"
            referencedColumns: ["id"]
          },
        ]
      }
      v_unclassified_bank_transactions: {
        Row: {
          account_number: string | null
          amount: number | null
          bank_account_id: string | null
          bank_name: string | null
          category_id: string | null
          date: string | null
          department_id: string | null
          description: string | null
          direction: string | null
          external_ref: string | null
          id: string | null
          imported_at: string | null
          is_classified: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_pending_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_print_label: {
        Args: { p_label_data: Json; p_secret: string }
        Returns: number
      }
      fn_recompute_credit_commission: {
        Args: { p_department_id: string; p_month: string }
        Returns: undefined
      }
      fn_sync_check_ledger: { Args: { p_check_id: string }; Returns: undefined }
      get_cash_flow_forecast: {
        Args: { p_bank_account_id: string; p_horizon_days?: number }
        Returns: {
          category: string
          expected_change: number
          forecast_date: string
          running_balance: number
          source: string
        }[]
      }
      get_department_cash_flow_forecast: {
        Args: { p_department_id: string; p_horizon_days?: number }
        Returns: {
          category: string
          expected_change: number
          forecast_date: string
          running_balance: number
          source: string
        }[]
      }
      get_pending_schedule_confirmations: {
        Args: never
        Returns: {
          bank_account_id: string
          department_id: string
          department_name: string
          direction: string
          expected_amount: number
          is_split: boolean
          period_date: string
          schedule_id: string
          schedule_name: string
          split_allocations: Json
        }[]
      }
      is_finance_admin: { Args: never; Returns: boolean }
      kiosk_mark_printed: {
        Args: { p_id: number; p_secret: string }
        Returns: undefined
      }
      kiosk_read_pending_labels: {
        Args: { p_secret: string }
        Returns: {
          created_at: string | null
          id: number
          label_data: Json
          printed_at: string | null
          status: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "print_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      materialize_known_recurring_occurrences: { Args: never; Returns: number }
      review_manual_entry: {
        Args: { p_decision: string; p_entry_id: string }
        Returns: undefined
      }
      settle_ledger_between: {
        Args: { p_dept_a: string; p_dept_b: string }
        Returns: number
      }
      user_can_set_check_dates: { Args: never; Returns: boolean }
      user_has_department: {
        Args: { p_department_id: string }
        Returns: boolean
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
