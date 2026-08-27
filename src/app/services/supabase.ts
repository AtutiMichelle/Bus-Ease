import { Service } from '@angular/core';
import { environment } from '../../environment';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Service()
export class Supabase {
    private supabase: SupabaseClient;
    
    constructor() {
        this.supabase = createClient(environment.supabase.url, environment.supabase.key);
    }

    getClient() {
        return this.supabase;
    }       
}