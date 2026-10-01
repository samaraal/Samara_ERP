const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const sql=n=>fs.readFileSync(path.join(root,'supabase/sql',n),'utf8');
const db=new PGlite();
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const admin=uid(1),bed=uid(10),otherBed=uid(11),resident=uid(20),other=uid(21);
const query=async(s,args=[])=> (await db.query(s,args)).rows;
const money=async(s,args=[])=>Number((await query(s,args))[0].amount);
async function save(day,room,nursing=0,id=uid(100),b=bed){
 return (await query('select save_room_tariff($1,$2,$3,$4,$5) as result',[b,day,'Test agreed tariff',JSON.stringify({room_no:b===bed?'109':'110',bed_no:'B',room_type:'Triple Sharing',status:'Occupied',room_daily_rate:room,nursing_daily_rate:nursing,special_nurse_daily_rate:0,daily_rate:room}),id]))[0].result;
}
async function charge(pid,day,type,amount){
 const prefix=type==='Daily Room Charge'?'ROOM':type==='Daily Nursing Charge'?'NURSING':'SPECIAL_NURSE';
 return db.query(`insert into billing_transactions(patient_id,transaction_type,category,amount,auto_generated,source_date,source_type,source_key,transaction_date) values($1,'Charge',$2,$3,true,$4,$5,$6,$4::date::timestamptz) on conflict(source_key) where source_key is not null do nothing`,[pid,prefix==='ROOM'?'Room Charges':prefix==='NURSING'?'Nursing Charges':'Special Nurse',amount,day,type,`${prefix}:${pid}:${day}`]);
}
async function net(pid,day,prefix='ROOM'){
 const key=`${prefix}:${pid}:${day}`;
 return money(`select coalesce(sum(case when transaction_type='Discount' then -amount else amount end),0) amount from billing_transactions where source_key=$1 or tariff_original_source_key=$1`,[key]);
}
(async()=>{
 await db.exec(`
 create schema auth;create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.role() returns text language sql as $$select 'authenticated'::text$$;
 create table duty_profiles(id uuid,auth_user_id uuid,role text,designation text);
 insert into duty_profiles values('${admin}',null,'Admin','Admin');
 select set_config('test.uid','${admin}',false);
 create function current_user_has_role(roles text[]) returns boolean language sql as $$select exists(select 1 from duty_profiles where id=auth.uid() and role=any(roles))$$;
 create function current_user_is_nurse_manager() returns boolean language sql as $$select exists(select 1 from duty_profiles where id=auth.uid() and designation='Nursing Manager')$$;
 create table patients(id uuid primary key,patient_id text,full_name text,admission_date date,discharge_date date,room_no text,bed_no text,is_active boolean default true,special_nurse_required boolean default false,package_end_date date);
 create table room_beds(id uuid primary key,patient_id uuid,room_no text,bed_no text,room_type text,status text,room_daily_rate numeric,nursing_daily_rate numeric,special_nurse_daily_rate numeric,daily_rate numeric,updated_at timestamptz);
 create table room_transfer_history(id uuid primary key default gen_random_uuid(),patient_id uuid,from_room_bed_id uuid,to_room_bed_id uuid,effective_at timestamptz,created_at timestamptz default now());
 create table billing_transactions(id uuid primary key default gen_random_uuid(),patient_id uuid,transaction_type text,category text,amount numeric check(amount>=0),payment_mode text,description text,transaction_date timestamptz,entered_by uuid,auto_generated boolean default false,source_date date,source_type text,source_key text);
 create unique index billing_source_key on billing_transactions(source_key) where source_key is not null;
 create table coverage(patient_id uuid,day date);create table cutoffs(patient_id uuid,day date);
 create function patient_package_covers_date(pid uuid,d date) returns boolean language sql as $$select exists(select 1 from coverage where patient_id=pid and day=d)$$;
 create function discharge_billing_cutoff(pid uuid) returns date language sql as $$select min(day) from cutoffs where patient_id=pid$$;
 create table daily_billing_runs(id uuid default gen_random_uuid(),charge_date date,run_type text,triggered_by uuid,status text,completed_at timestamptz,room_charges_created int,nursing_charges_created int,skipped_count int,error_count int,details jsonb);
 create table patient_discharges(id uuid primary key,patient_id uuid,status text,accounts_status text,billing_clearance_status text,accounts_cleared_at timestamptz,accounts_recheck_at timestamptz,accounts_recheck_reason text,accounts_remarks text,updated_at timestamptz);
 create table discharge_workflow_events(discharge_id uuid,event_type text,actor_id uuid,details jsonb);
 insert into patients values('${resident}','RES-1','Test Resident','2026-09-01',null,'109','B',true,false,null),('${other}','RES-2','Other Resident','2026-09-01',null,'110','B',true,false,null);
 insert into room_beds values('${bed}','${resident}','109','B','Triple Sharing','Occupied',3200,0,0,3200,now()),('${otherBed}','${other}','110','B','Triple Sharing','Occupied',4000,500,0,4000,now());
 `);
 let billing=sql('131_discharge_history_and_departure.sql');
 billing=billing.slice(billing.indexOf('CREATE OR REPLACE FUNCTION public.run_daily_billing_automation('),billing.indexOf('CREATE OR REPLACE FUNCTION public.confirm_patient_departure_v3('));
 await db.exec(billing);await db.exec(sql('132_zero_nursing_tariff.sql'));
 const guards=sql('131_discharge_history_and_departure.sql');
 await db.exec(guards.slice(guards.indexOf('create or replace function public.samara_financial_activity_guard()'),guards.indexOf('create or replace function public.discharge_billing_cutoff(')));
 await db.exec('create trigger test_financial_guard before insert or update or delete on billing_transactions for each row execute function samara_financial_activity_guard();');
 for(const day of ['2026-09-01','2026-09-02','2026-09-03'])await charge(resident,day,'Daily Room Charge',3200);
 await charge(other,'2026-09-02','Daily Room Charge',4000);
 await db.exec(`insert into billing_transactions(patient_id,transaction_type,category,amount,source_key) values('${resident}','Payment','Receipt',5000,'PAYMENT-1');`);
 await db.exec(sql('182_room_tariff_effective_dates.sql'));
 assert.equal(await money("select amount from billing_transactions where source_key='PAYMENT-1'"),5000);
 assert.equal((await query('select count(*)::int n from billing_transactions where tariff_change_id is not null'))[0].n,0,'migration does not reprice');
 await db.exec(`insert into patient_discharges(id,patient_id,status,accounts_status,billing_clearance_status,accounts_cleared_at) values('${uid(30)}','${resident}','Management Approved','Cleared','Cleared',now());`);
 let result=await save('2026-09-02',3000);
 assert.equal((await query('select accounts_status from patient_discharges where id=$1',[uid(30)]))[0].accounts_status,'Pending','adjustments invalidate prior accounts clearance through existing guard');
 assert.equal(result.entries_posted,2);assert.equal(Number(result.credits),400);
 assert.equal(await net(resident,'2026-09-01'),3200);assert.equal(await net(resident,'2026-09-02'),3000);assert.equal(await net(other,'2026-09-02'),4000);
 assert.equal(await money('select amount from billing_transactions where source_key=$1',[`ROOM:${resident}:2026-09-02`]),3200,'original remains');
 const before=(await query('select count(*)::int n from billing_transactions'))[0].n;
 await save('2026-09-02',3000);assert.equal((await query('select count(*)::int n from billing_transactions'))[0].n,before,'request retry is idempotent');
 result=await save('2026-09-02',3000,0,uid(101));assert.equal(result.entries_posted,0,'same tariff repeat has no adjustments');
 await save('2026-09-02',3400,100,uid(102));assert.equal(await net(resident,'2026-09-02'),3400);assert.equal(await net(resident,'2026-09-02','NURSING'),100,'zero to positive');
 await save('2026-09-03',3600,0,uid(103));assert.equal(await net(resident,'2026-09-03','NURSING'),0,'positive to zero credit');
 await save('2026-09-01',2800,0,uid(104));assert.equal(await net(resident,'2026-09-01'),2800);assert.equal(await net(resident,'2026-09-02'),3400);assert.equal(await net(resident,'2026-09-03'),3600,'later tariffs retained');
 assert.equal(await money('select room_daily_rate amount from room_beds where id=$1',[bed]),3600,'current tariff retained after older insertion');
 await assert.rejects(()=>save('2099-01-01',1,0,uid(105)),/today or earlier/);
 await assert.rejects(()=>save('2026-09-01',1,0,uid(100)),/already used/);
 await assert.rejects(()=>db.exec(`update room_beds set room_daily_rate=99 where id='${bed}'`),/Effective from/);
 await assert.rejects(()=>db.exec("update billing_transactions set amount=0 where tariff_change_id is not null"),/permanent audit/);
 await db.exec(`update duty_profiles set role='Accounts' where id='${admin}'`);
 await assert.rejects(()=>save('2026-09-02',1,0,uid(106)),/Only Admin/);
 await db.exec(`update duty_profiles set role='Manager',designation='Nursing Manager' where id='${admin}'`);
 await assert.rejects(()=>save('2026-09-02',1,0,uid(107)),/Only Admin/);
 await db.exec(`update duty_profiles set role='Admin',designation='Admin' where id='${admin}'`);
 // Package days and reviewed-departure rows must not be repriced.
 await db.exec(`insert into coverage values('${resident}','2026-09-02');insert into cutoffs values('${resident}','2026-09-02');`);
 await save('2026-09-02',3900,0,uid(108));assert.equal(await net(resident,'2026-09-02'),3400);assert.equal(await net(resident,'2026-09-03'),3600);
 await db.exec('delete from coverage;delete from cutoffs;');
 // Actual per-date lookup in the existing catch-up generator, including nursing
 // required historically even when today's nursing tariff is zero.
 await save('2026-09-04',3700,100,uid(110));
 await save('2026-09-05',3800,0,uid(111));
 const run=(await query(`select run_daily_billing_automation('2026-09-05',true) result`))[0].result;
 assert.equal(run.success,true,JSON.stringify(run));
 assert.equal(await money('select amount from billing_transactions where source_key=$1',[`NURSING:${resident}:2026-09-04`]),100,'historical nursing is billed even when current rate is zero');
 assert.equal(await net(resident,'2026-09-04'),3700,'catch-up uses the historical tariff');
 // Transfer boundaries and former occupants.
 await db.exec(`insert into room_transfer_history(patient_id,from_room_bed_id,to_room_bed_id,effective_at) values('${resident}','${bed}','${otherBed}','2026-09-03T08:00:00+05:30');`);
 assert.equal((await query('select room_bed_on_date($1,$2) bed',[resident,'2026-09-02']))[0].bed,bed);
 assert.equal((await query('select room_bed_on_date($1,$2) bed',[resident,'2026-09-03']))[0].bed,otherBed);
 assert.equal(await net(resident,'2026-09-03'),4000,'room move reconciles the new room tariff');
 await save('2026-09-03',4100,0,uid(109));assert.equal(await net(resident,'2026-09-03'),4000,'old bed edit cannot reprice after transfer');
 // Simulate the delete/reinsert performed by the existing transfer RPC.
 await db.query('delete from billing_transactions where patient_id=$1 and source_date=$2 and auto_generated',[resident,'2026-09-03']);
 await charge(resident,'2026-09-03','Daily Room Charge',4000);
 assert.equal(await net(resident,'2026-09-03'),4000,'transfer delete/reinsert does not duplicate adjustments');
 assert.equal(await money('select amount from billing_transactions where source_key=$1',[`ROOM:${resident}:2026-09-03`]),3200,'original survives room move');
 const context=(await query('select patient_room_tariff_context($1) result',[resident]))[0].result;
 assert.equal(Number(context.room.room_rate),4000,'ledger verification uses dated room history');
 // A mid-save failure must roll back tariff history, room update and all adjustments.
 const oldRate=await money('select room_daily_rate amount from room_beds where id=$1',[otherBed]);
 await db.exec(`create function test_reject_adjustment() returns trigger language plpgsql as $$begin if new.tariff_change_id='${uid(120)}'::uuid then raise exception 'Test ledger unavailable';end if;return new;end$$;create trigger test_failure before insert on billing_transactions for each row execute function test_reject_adjustment();`);
 await assert.rejects(()=>save('2026-09-02',4500,0,uid(120),otherBed),/Test ledger unavailable/);
 assert.equal(await money('select room_daily_rate amount from room_beds where id=$1',[otherBed]),oldRate,'atomic rollback');
 assert.equal((await query('select count(*)::int n from room_tariff_changes where id=$1',[uid(120)]))[0].n,0);
 await db.exec(sql('182_room_tariff_effective_dates.sql'));assert.equal(await money("select amount from billing_transactions where source_key='PAYMENT-1'"),5000,'rerun migration preserves payments');
 await db.exec('set role anon');
 await assert.rejects(()=>query('select save_room_tariff($1,$2,$3,$4,$5)',[bed,'2026-09-01','Unauthorised','{}',uid(130)]),/permission denied/);
 await assert.rejects(()=>query('select * from room_tariff_changes'),/permission denied/);
 await db.exec('reset role');
 console.log('PASS: migration, original-entry preservation, date boundaries, credits/debits, duplicate saves, zero rates, later tariffs, role checks, package/departure exclusions, transfer reconciliation, immutable audit entries, atomic rollback, public-access denial and migration rerun.');
 await db.close();
})().catch(async e=>{console.error(e);await db.close();process.exitCode=1;});
