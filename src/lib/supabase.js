import { createClient } from '@supabase/supabase-js'


const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://sclhzmgdafotyiynrjwr.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_N1UhoXnqybNEFCGBMdWXWg_BujE6Eh-';


export const supabase = createClient(supabaseUrl, supabaseAnonKey)