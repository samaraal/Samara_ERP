(() => {
  'use strict';
  const APP_VERSION = '2.14.28';

  // Shared overdue label helper used by both the clinical alert engine and UI pages.
  // Keep this in application scope: ClinicalAlertsPage and the global notification
  // centre render outside the alert-engine hook and must be able to call it safely.
  function englishOverdueLabel(minutes){
    const m=Math.max(0,Math.floor(Number(minutes||0)));
    if(m<60)return `${m} min overdue`;
    const h=Math.floor(m/60),r=m%60;
    return `${h} hr${h===1?'':'s'}${r?` ${r} min`:''} overdue`;
  }

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


