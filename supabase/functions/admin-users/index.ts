import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const allowedRoles = ['Admin', 'Manager', 'Nurse', 'Caregiver', 'Accounts', 'Kitchen'] as const
function normalizeRole(value: unknown) {
  const raw = String(value || '').trim().toLowerCase()
  const role = allowedRoles.find((item) => item.toLowerCase() === raw)
  if (!role) throw new Error('Invalid employee role selected')
  return role
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') || ''
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })
    const body = await req.json()

    const normalizeLoginId = (value: unknown) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9._@-]/g, '')
    const getIp = () => (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || '').split(',')[0].trim() || null
    async function securityEvent(loginId: string, eventType: string, details: Record<string, unknown> = {}) {
      await admin.from('password_security_events').insert({ login_id: loginId || null, event_type: eventType, ip_address: getIp(), details })
    }

    if (body.action === 'login_precheck' || body.action === 'login_failure' || body.action === 'login_success') {
      const loginId = normalizeLoginId(body.login_id)
      if (!loginId) return json({ ok: true, locked: false })
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
      if (body.action === 'login_success') {
        await securityEvent(loginId, 'LOGIN_SUCCESS')
        return json({ ok: true, locked: false })
      }
      if (body.action === 'login_failure') await securityEvent(loginId, 'LOGIN_FAILURE')
      const { count } = await admin.from('password_security_events').select('*', { count: 'exact', head: true }).eq('login_id', loginId).eq('event_type', 'LOGIN_FAILURE').gte('created_at', since)
      const locked = Number(count || 0) >= 5
      if (locked && body.action === 'login_failure') await securityEvent(loginId, 'ACCOUNT_TEMPORARILY_LOCKED', { minutes: 15 })
      return json({ ok: true, locked, retry_after_minutes: locked ? 15 : 0 })
    }

    if (body.action === 'request_password_recovery') {
      const requested = String(body.login_id || '').trim().toLowerCase()
      const normalized = normalizeLoginId(requested)
      const redirectTo = String(body.redirect_to || '').trim()
      const { data: profile } = await admin.from('profiles').select('id,auth_user_id,login_id,employee_email,auth_email,is_active,active').or(`login_id.eq.${normalized},employee_email.eq.${requested}`).maybeSingle()
      // Always return a generic response to prevent account enumeration.
      if (!profile || (profile.is_active === false || profile.active === false) || !profile.employee_email) {
        await securityEvent(normalized, 'PASSWORD_RECOVERY_REQUEST_UNDELIVERABLE')
        return json({ ok: true })
      }
      const authUserId = profile.auth_user_id || profile.id
      const email = String(profile.employee_email).trim().toLowerCase()
      const { error: updateError } = await admin.auth.admin.updateUserById(authUserId, { email, email_confirm: true, ban_duration: 'none' })
      if (!updateError) {
        await admin.from('profiles').update({ auth_email: email, auth_user_id: authUserId }).eq('id', profile.id)
        const { error: resetError } = await admin.auth.resetPasswordForEmail(email, { redirectTo })
        await securityEvent(String(profile.login_id || normalized), resetError ? 'PASSWORD_RECOVERY_EMAIL_FAILED' : 'PASSWORD_RECOVERY_EMAIL_SENT', resetError ? { error: resetError.message } : {})
      }
      return json({ ok: true })
    }

    const { data: { user }, error: userError } = await caller.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    const { data: callerProfile, error: callerProfileError } = await admin
      .from('profiles').select('role,is_active,active').or(`id.eq.${user.id},auth_user_id.eq.${user.id}`).single()
    if (callerProfileError || !callerProfile) throw new Error('Employee profile not found')
    const callerActive = callerProfile.is_active ?? callerProfile.active ?? false
    const callerRole = String(callerProfile.role || '').toLowerCase()
    if (!callerActive || !['admin', 'manager'].includes(callerRole)) throw new Error('Administrator or Manager access required')

    async function listAllUsers() {
      const users: any[] = []
      for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
        if (error) throw error
        users.push(...data.users)
        if (data.users.length < 100) break
      }
      return users
    }

    async function getTargetProfile(userId: string) {
      const { data, error } = await admin.from('profiles').select('*').or(`id.eq.${userId},auth_user_id.eq.${userId}`).single()
      if (error || !data) throw new Error('Employee profile not found')
      if (callerRole === 'manager' && String(data.role).toLowerCase() === 'admin') throw new Error('Managers cannot change Administrator accounts')
      return data
    }

    async function setProfileActive(profileId: string, enabled: boolean) {
      const { error } = await admin.from('profiles').update({ is_active: enabled, active: enabled }).eq('id', profileId)
      if (error) throw error
    }

    async function audit(action: string, entityId: string, details: Record<string, unknown> = {}) {
      await admin.from('audit_log').insert({ user_id: user.id, action, entity: 'profiles', entity_id: entityId, details })
    }

    if (body.action === 'auth_status') {
      const users = (await listAllUsers()).map((u) => ({
        id: u.id,
        email: u.email,
        confirmed: Boolean(u.email_confirmed_at || u.confirmed_at),
        banned: Boolean(u.banned_until && new Date(u.banned_until).getTime() > Date.now()),
        banned_until: u.banned_until,
        last_sign_in_at: u.last_sign_in_at,
        created_at: u.created_at,
      }))
      return json({ ok: true, users })
    }

    if (body.action === 'create' || body.action === 'create_or_repair') {
      const loginId = String(body.login_id || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
      const employeeId = String(body.employee_id || '').trim()
      const password = String(body.password || '')
      const role = normalizeRole(body.role || 'Caregiver')
      if (!loginId || !password || !body.full_name || !role) throw new Error('Name, role, Login ID and password are required')
      if (password.length < 8) throw new Error('Password must contain at least 8 characters')
      if (callerRole === 'manager' && role.toLowerCase() === 'admin') throw new Error('Managers cannot create Administrator accounts')

      const internalEmail = `${loginId}@users.samaracare.local`
      const { data: existingProfileByLogin } = await admin.from('profiles').select('*').eq('login_id', loginId).maybeSingle()
      if (employeeId) {
        const { data: duplicateEmployee } = await admin.from('profiles').select('id,login_id').eq('employee_id', employeeId).maybeSingle()
        if (duplicateEmployee && duplicateEmployee.id !== existingProfileByLogin?.id) throw new Error(`Employee ID ${employeeId} is already used by ${duplicateEmployee.login_id}`)
      }

      const allUsers = await listAllUsers()
      const existingAuth = allUsers.find((u) => String(u.email || '').toLowerCase() === internalEmail)

      if (existingProfileByLogin && existingAuth && (existingProfileByLogin.auth_user_id === existingAuth.id || existingProfileByLogin.id === existingAuth.id)) {
        throw new Error('This Login ID already has a complete employee account. Use Reset Password instead.')
      }

      if (existingAuth && !existingProfileByLogin) {
        const { error: profileError } = await admin.from('profiles').upsert({
          id: existingAuth.id,
          auth_user_id: existingAuth.id,
          title: body.title || null,
          preferred_name: body.preferred_name || null,
          full_name: body.full_name,
          must_change_password: true,
          employee_id: employeeId || null,
          login_id: loginId,
          auth_email: internalEmail,
          employee_email: body.employee_email || null,
          mobile: body.mobile || null,
          designation: body.designation || null,
          father_guardian_name: body.father_guardian_name || null,
          address: body.address || null,
          date_of_birth: body.date_of_birth || null,
          date_of_joining: body.date_of_joining || null,
          blood_group: body.blood_group || null,
          emergency_contact: body.emergency_contact || null,
          id_card_type: body.id_card_type || null,
          id_card_number: body.id_card_number || null,
          qualification: body.qualification || null,
          previous_workplace: body.previous_workplace || null,
          reference_type: body.reference_type || 'Direct',
          reference_name: body.reference_name || null,
          reference_contact: body.reference_contact || null,
          role,
          active: true,
          is_active: true,
        }, { onConflict: 'id' })
        if (profileError) throw profileError
        const { error: authError } = await admin.auth.admin.updateUserById(existingAuth.id, { password, email_confirm: true, ban_duration: 'none', user_metadata: { title: body.title || null, preferred_name: body.preferred_name || null, full_name: body.full_name, login_id: loginId, role, must_change_password: true } })
        if (authError) throw authError
        await audit('REPAIR_EMPLOYEE_PROFILE', existingAuth.id, { login_id: loginId, role })
        return json({ ok: true, repaired: true, user_id: existingAuth.id, role })
      }

      if (existingProfileByLogin && !existingAuth) {
        throw new Error('A profile already exists for this Login ID, but its Authentication account is missing. Use Repair Account on the employee row.')
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: internalEmail,
        password,
        email_confirm: true,
        user_metadata: { title: body.title || null, preferred_name: body.preferred_name || null, full_name: body.full_name, login_id: loginId, role, must_change_password: true },
      })
      if (createError || !created.user) throw createError || new Error('Authentication user was not created')

      const { error: profileError } = await admin.from('profiles').upsert({
        id: created.user.id,
        auth_user_id: created.user.id,
        title: body.title || null,
        preferred_name: body.preferred_name || null,
        full_name: body.full_name,
        must_change_password: true,
        employee_id: employeeId || null,
        login_id: loginId,
        auth_email: internalEmail,
        employee_email: body.employee_email || null,
        mobile: body.mobile || null,
        designation: body.designation || null,
        father_guardian_name: body.father_guardian_name || null,
        address: body.address || null,
        date_of_birth: body.date_of_birth || null,
        date_of_joining: body.date_of_joining || null,
        blood_group: body.blood_group || null,
        emergency_contact: body.emergency_contact || null,
        id_card_type: body.id_card_type || null,
        id_card_number: body.id_card_number || null,
        qualification: body.qualification || null,
        previous_workplace: body.previous_workplace || null,
        reference_type: body.reference_type || 'Direct',
        reference_name: body.reference_name || null,
        reference_contact: body.reference_contact || null,
        role,
        active: true,
        is_active: true,
      }, { onConflict: 'id' })
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id)
        throw new Error(`Employee profile creation failed and the partial login was rolled back: ${profileError.message}`)
      }

      const { data: savedRole, error: roleSaveError } = await admin
        .from('profiles')
        .update({ role })
        .or(`id.eq.${created.user.id},auth_user_id.eq.${created.user.id}`)
        .select('id,role')
        .single()
      if (roleSaveError || savedRole?.role !== role) {
        await admin.from('profiles').delete().eq('id', created.user.id)
        await admin.auth.admin.deleteUser(created.user.id)
        throw new Error('Employee role could not be saved correctly. No incomplete account was retained.')
      }

      const { data: verifyProfile } = await admin.from('profiles').select('id,role').eq('id', created.user.id).maybeSingle()
      const { data: verifyAuth } = await admin.auth.admin.getUserById(created.user.id)
      if (!verifyProfile || verifyProfile.role !== role || !verifyAuth.user) {
        await admin.from('profiles').delete().eq('id', created.user.id)
        await admin.auth.admin.deleteUser(created.user.id)
        throw new Error('Employee verification failed. No incomplete account was retained.')
      }

      await audit('CREATE_EMPLOYEE', created.user.id, { login_id: loginId, role })
      return json({ ok: true, repaired: false, user_id: created.user.id, role })
    }

    if (body.action === 'set_role') {
      const requestedRole = normalizeRole(body.role)
      const target = await getTargetProfile(String(body.user_id || body.profile_id || ''))
      if (callerRole === 'manager' && requestedRole === 'Admin') throw new Error('Managers cannot assign the Administrator role')

      const authUserId = String(target.auth_user_id || target.id)
      const { error: profileRoleError } = await admin
        .from('profiles')
        .update({ role: requestedRole, updated_at: new Date().toISOString() })
        .or(`id.eq.${target.id},auth_user_id.eq.${authUserId}`)
      if (profileRoleError) throw profileRoleError

      const { data: authResult, error: authRoleError } = await admin.auth.admin.getUserById(authUserId)
      if (!authRoleError && authResult?.user) {
        const metadata = { ...(authResult.user.user_metadata || {}), role: requestedRole }
        const { error: metadataError } = await admin.auth.admin.updateUserById(authUserId, { user_metadata: metadata })
        if (metadataError) throw metadataError
      }

      const { data: verified, error: verifyError } = await admin
        .from('profiles').select('id,auth_user_id,role').or(`id.eq.${target.id},auth_user_id.eq.${authUserId}`).single()
      if (verifyError || verified?.role !== requestedRole) throw new Error('The selected employee role could not be saved correctly')
      await audit('SET_EMPLOYEE_ROLE', verified.id, { role: requestedRole })
      return json({ ok: true, user_id: verified.id, role: verified.role })
    }

    if (body.action === 'repair_account') {
      const oldProfile = await getTargetProfile(String(body.profile_id || ''))
      const password = String(body.password || '')
      if (password.length < 8) throw new Error('Temporary password must contain at least 8 characters')
      const loginId = String(oldProfile.login_id || '').trim().toLowerCase()
      if (!loginId) throw new Error('This profile has no Login ID')
      const internalEmail = String(oldProfile.auth_email || `${loginId}@users.samaracare.local`).toLowerCase()
      const allUsers = await listAllUsers()
      let authUser = allUsers.find((u) => u.id === oldProfile.auth_user_id)
        || allUsers.find((u) => String(u.email || '').toLowerCase() === internalEmail)
        || allUsers.find((u) => String(u.user_metadata?.login_id || '').toLowerCase() === loginId)

      if (!authUser) {
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email: internalEmail,
          password,
          email_confirm: true,
          user_metadata: { full_name: oldProfile.full_name, login_id: loginId, role: oldProfile.role },
        })
        if (createError || !created.user) throw createError || new Error('Unable to create the Authentication account')
        authUser = created.user
      } else {
        const { error: updateError } = await admin.auth.admin.updateUserById(authUser.id, {
          password,
          email_confirm: true,
          ban_duration: 'none',
          user_metadata: { ...(authUser.user_metadata || {}), full_name: oldProfile.full_name, login_id: loginId, role: oldProfile.role },
        })
        if (updateError) throw updateError
      }

      const { error: linkError } = await admin.from('profiles').update({
        auth_user_id: authUser.id,
        auth_email: authUser.email || internalEmail,
        active: true,
        is_active: true,
      }).eq('id', oldProfile.id)
      if (linkError) {
        if (!allUsers.some((u) => u.id === authUser.id)) await admin.auth.admin.deleteUser(authUser.id)
        throw new Error(`Unable to link the Authentication account: ${linkError.message}`)
      }

      await audit('REPAIR_MISSING_AUTH_ACCOUNT', oldProfile.id, { login_id: loginId, auth_user_id: authUser.id })
      return json({ ok: true, profile_id: oldProfile.id, auth_user_id: authUser.id })
    }

    if (body.action === 'toggle') {
      const target = await getTargetProfile(String(body.user_id || ''))
      const enabled = Boolean(body.is_active)
      await setProfileActive(target.id, enabled)
      const authUserId = target.auth_user_id || target.id
      const { error: authError } = await admin.auth.admin.updateUserById(authUserId, { ban_duration: enabled ? 'none' : '876000h' })
      if (authError) throw authError
      await audit(enabled ? 'ENABLE_EMPLOYEE' : 'DISABLE_EMPLOYEE', target.id)
      return json({ ok: true })
    }

    if (body.action === 'reset_password') {
      const target = await getTargetProfile(String(body.user_id || ''))
      const password = String(body.password || '')
      if (password.length < 8) throw new Error('Password must contain at least 8 characters')
      const authUserId = target.auth_user_id || target.id
      const { data: authUser, error: getUserError } = await admin.auth.admin.getUserById(authUserId)
      if (getUserError || !authUser.user) throw new Error('No matching Supabase Authentication user exists for this employee')
      const { error: updateAuthError } = await admin.auth.admin.updateUserById(authUserId, { password, email_confirm: true, ban_duration: 'none' })
      if (updateAuthError) throw updateAuthError
      await setProfileActive(target.id, true)
      await admin.from('profiles').update({ must_change_password: true }).eq('id', target.id)
      if (authUser.user.email) await admin.from('profiles').update({ auth_user_id: authUserId, auth_email: authUser.user.email }).eq('id', target.id)
      await audit('RESET_EMPLOYEE_PASSWORD', target.id, { login_id: target.login_id, restored_access: true })
      return json({ ok: true })
    }

    throw new Error('Unsupported action')
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 400)
  }
})
