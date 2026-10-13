// Deploy to the existing Samara ERP Supabase project. Same secrets as erp-help-ai / Ask Samara AI.
// 2.16.38: login verified first, then staff profile + request budget read at the same time (faster).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHandler } from './handler.mjs';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
Deno.serve(createHandler({
  env:(name:string)=>Deno.env.get(name),
  async verify(token:string){const {data,error}=await admin.auth.getUser(token);return error||!data.user?null:data.user.id;},
  async profile(id:string){
    const {data:profile,error}=await admin.from('profiles').select('*').or(`id.eq.${id},auth_user_id.eq.${id}`).limit(1).maybeSingle();
    if(error)throw error;if(!profile)return null;
    // '*' so both the newer is_active and the older active column are checked, whichever exists.
    return {role:profile.role,is_active:profile.is_active,active:profile.active};
  },
  async consume(id:string){const {data,error}=await admin.rpc('talk_to_guest_take_budget',{staff_id:id});if(error)throw error;return data===true;}
}));
