(() => {
  'use strict';
  const report = { version: '7.1.0', checkedAt: new Date().toISOString(), checks: {} };
  function set(name, ok, detail) { report.checks[name] = { ok: Boolean(ok), detail: detail || '' }; }
  set('browser', Boolean(window.Promise && window.fetch), 'Modern browser APIs');
  set('react', Boolean(window.React && window.ReactDOM), 'React libraries loaded');
  set('supabaseSdk', Boolean(window.supabase), 'Supabase browser SDK loaded');
  set('configuration', Boolean(window.SAMARA_CONFIG?.supabaseUrl && window.SAMARA_CONFIG?.supabasePublishableKey), 'Supabase URL and publishable key');
  set('secureContext', window.isSecureContext || location.hostname === 'localhost', window.isSecureContext ? 'HTTPS' : 'Camera requires HTTPS');
  set('cameraApi', Boolean(navigator.mediaDevices?.getUserMedia), 'Camera / webcam API');
  window.SAMARA_HEALTH = report;
  window.addEventListener('load', async () => {
    try {
      if (!window.supabase || !window.SAMARA_CONFIG) return;
      const c = window.supabase.createClient(window.SAMARA_CONFIG.supabaseUrl, window.SAMARA_CONFIG.supabasePublishableKey, { auth: { persistSession: false } });
      const { error: profileError } = await c.from('profiles').select('id').limit(1);
      set('profilesTable', !profileError, profileError?.message || 'Available');
      const { error: docsError } = await c.from('employee_documents').select('id,document_type').limit(1);
      set('employeeDocumentsTable', !docsError, docsError?.message || 'Available');
      const { data: buckets, error: bucketError } = await c.storage.listBuckets();
      if (bucketError) set('storage', false, bucketError.message);
      else {
        const names = (buckets || []).map(b => b.name);
        set('employeeDocumentsBucket', names.includes('employee-documents'), names.includes('employee-documents') ? 'Available' : 'Missing');
        set('patientDocumentsBucket', names.includes('patient-documents'), names.includes('patient-documents') ? 'Available' : 'Missing');
      }
    } catch (error) {
      set('cloudConnection', false, error.message || String(error));
    }
    console.info('Samara Care health check', window.SAMARA_HEALTH);
  });
})();
