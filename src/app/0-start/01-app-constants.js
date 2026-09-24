(() => {
  'use strict';
  const APP_VERSION = '2.14.38';

  // Shared overdue label helper used by both the clinical alert engine and UI pages.
  // Keep this in application scope: ClinicalAlertsPage and the global notification
  // centre render outside the alert-engine hook and must be able to call it safely.
  function englishOverdueLabel(minutes){
    const m=Math.max(0,Math.floor(Number(minutes||0)));
    if(m<60)return `${m} min overdue`;
    const h=Math.floor(m/60),r=m%60;
    return `${h} hr${h===1?'':'s'}${r?` ${r} min`:''} overdue`;
  }

  // v2.14.36: Turn technical database / network errors into simple English for staff.
  // The original technical message is still written to the browser console for support.
  function samaraFriendlyError(raw){
    const text=String(raw==null?'':(raw.message||raw.error_description||raw.error||raw)).trim();
    if(!text)return 'Something went wrong. Please try again.';
    const t=text.toLowerCase();
    const col=(text.match(/column "([^"]+)"/i)||[])[1];
    const nice=v=>String(v||'').replace(/_/g,' ');
    const rules=[
      [/failed to fetch|networkerror|network request failed|load failed|timed out|timeout|err_internet|connection/,'Could not connect to the server. Please check the internet connection and try again.'],
      [/jwt expired|invalid refresh token|refresh token|not authenticated|session (has )?expired|auth session missing|invalid erp session|erp sign-in required/,'Your login session has expired. Please sign out and sign in again.'],
      [/row-level security|permission denied|not authori[sz]ed|access denied|insufficient privilege/,'You do not have permission to do this. Please contact the Administrator.'],
      [/duplicate key value|already exists|unique constraint/,'This record already exists. Please check for a duplicate entry before saving again.'],
      [/violates foreign key constraint/,/is still referenced/.test(t)?'This record cannot be removed because other records are linked to it.':'This entry is linked to a record that is missing. Please refresh the page and try again.'],
      [/violates not-null constraint|null value in column/,col?`Please fill in the required field: ${nice(col)}.`:'A required field is empty. Please fill in all required fields.'],
      [/patients_admission_status_check/,'The admission status could not be saved. Please contact the Administrator.'],
      [/violates check constraint/,'One of the entries is not allowed by the system. Please check the entries (for example status, dates or amounts) and try again.'],
      [/invalid input syntax|invalid input value|date\/time field value out of range|out of range for type/,'One of the entries is in the wrong format (for example a date, time or number). Please check and try again.'],
      [/value too long/,'One of the entries is too long. Please shorten it and try again.'],
      [/does not exist|could not find the .* (column|function|table)|schema cache/,'This part of the system needs an update. Please contact the Administrator.'],
      [/non-2xx|edge function|internal server error|status code 5\d\d|http 5\d\d/,'The server could not complete the request. Please try again in a moment.'],
      [/too many requests|rate limit/,'Too many attempts. Please wait a minute and try again.']
    ];
    for(const [pattern,message] of rules){
      if(pattern.test(t)){
        try{console.warn('[Samara] Technical error shown to user as simple message:',text)}catch(_){}
        return message;
      }
    }
    return text;
  }
  window.samaraFriendlyError=samaraFriendlyError;

  const APP_BUILD_DATE = '24-Sep-2026 Page crash protection + error log';
  const APP_SCHEMA_VERSION = '38';

  const BLOOD_GROUPS=['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'];
  const RESIDENT_PROFESSIONS=[
    'Government Employee',
    'Private Employee',
    'Business / Self-employed',
    'Professional Practice',
    'Homemaker',
    'Agriculture',
    'Retired',
    'Not Employed',
    'Student',
    'Other'
  ];
  const RESIDENT_FIELDS=[
    'Medical & Healthcare',
    'Engineering & Technology',
    'Law / Legal',
    'Accounting & Finance',
    'Education / Teaching',
    'Government Administration',
    'Business / Commerce',
    'Banking / Insurance',
    'Information Technology / Software',
    'Agriculture',
    'Defence / Police',
    'Arts / Media',
    'Skilled Trade / Technical',
    'Social Service / NGO',
    'Other'
  ];
  const EMPLOYMENT_SERVICE_STATUS=['In Service','Retired'];

  const CURRENT_CENTRE_CODE='MOG';
  const CURRENT_CENTRE_NAME='Mogappair';
  window.APP_VERSION = APP_VERSION;
  window.SAMARA_BUILD = Object.freeze({
    version: APP_VERSION,
    buildDate: APP_BUILD_DATE,
    schemaVersion: APP_SCHEMA_VERSION
  });
  console.info(`Samara Care ERP ${APP_VERSION} | Build: ${APP_BUILD_DATE} | Schema: ${APP_SCHEMA_VERSION}`);


