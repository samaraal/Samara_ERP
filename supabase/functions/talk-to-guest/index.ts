// Deploy to the existing Samara ERP Supabase project. Same secrets as erp-help-ai / Ask Samara AI.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHandler } from './handler.mjs';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
Deno.serve(createHandler({
  env:(name:string)=>Deno.env.get(name),
  async authorize(token:string){
    const {data,error}=await admin.auth.getUser(token);if(error||!data.user)return null;
    const {data:profile,error:profileError}=await admin.from('profiles').select('*').or(`id.eq.${data.user.id},auth_user_id.eq.${data.user.id}`).limit(1).maybeSingle();
    if(profileError)throw profileError;if(!profile)return null;
    // '*' so both the newer is_active and the older active column are checked, whichever exists.
    return {id:data.user.id,role:profile.role,is_active:profile.is_active,active:profile.active};
  },
  async consume(id:string){const {data,error}=await admin.rpc('talk_to_guest_take_budget',{staff_id:id});if(error)throw error;return data===true;}
}));
