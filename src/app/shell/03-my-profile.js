  function MyProfile({profile,onProfileUpdate}){
    const [contact,setContact]=React.useState({
      mobile:profile?.mobile||'',
      employee_email:profile?.employee_email||'',
      address:profile?.address||profile?.current_address||'',
      emergency_contact:profile?.emergency_contact||''
    });
    const [username,setUsername]=React.useState(profile?.login_id||'');
    const [currentPasswordForUsername,setCurrentPasswordForUsername]=React.useState('');
    const [currentPassword,setCurrentPassword]=React.useState('');
    const [newPassword,setNewPassword]=React.useState('');
    const [confirmPassword,setConfirmPassword]=React.useState('');
    const [busy,setBusy]=React.useState('');
    const [message,setMessage]=React.useState('');

    React.useEffect(()=>{
      setContact({
        mobile:profile?.mobile||'',
        employee_email:profile?.employee_email||'',
        address:profile?.address||profile?.current_address||'',
        emergency_contact:profile?.emergency_contact||''
      });
      setUsername(profile?.login_id||'');
    },[profile?.id,profile?.mobile,profile?.employee_email,profile?.address,profile?.current_address,profile?.emergency_contact,profile?.login_id]);

    async function selfRequest(payload){
      const {data:{session}}=await client.auth.getSession();
      if(!session)throw new Error('Your session has expired. Please sign in again.');
      const response=await fetch(`${cfg.supabaseUrl}/functions/v1/admin-users`,{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization':`Bearer ${session.access_token}`,
          'apikey':cfg.supabasePublishableKey
        },
        body:JSON.stringify(payload)
      });
      const result=await response.json().catch(()=>({error:'Unable to read server response'}));
      if(!response.ok||result.error)throw new Error(result.error||'Unable to complete the request');
      return result;
    }

    function cleanLogin(value){
      return String(value||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,'');
    }

    async function saveContact(e){
      e.preventDefault();
      setBusy('contact');setMessage('');
      try{
        const result=await selfRequest({
          action:'self_update_profile',
          mobile:String(contact.mobile||'').trim(),
          employee_email:String(contact.employee_email||'').trim().toLowerCase(),
          address:String(contact.address||'').trim(),
          emergency_contact:String(contact.emergency_contact||'').trim()
        });
        const next=result.profile||{...profile,...contact};
        onProfileUpdate&&onProfileUpdate(next);
        setMessage('✓ Personal contact details updated successfully.');
      }catch(error){setMessage(error.message||'Unable to update your profile.')}
      setBusy('');
    }

    async function changeUsername(e){
      e.preventDefault();
      const nextLogin=cleanLogin(username);
      if(nextLogin.length<3){setMessage('Login ID must contain at least 3 characters.');return}
      if(!currentPasswordForUsername){setMessage('Enter your current password to change the Login ID.');return}
      setBusy('username');setMessage('');
      try{
        const result=await selfRequest({
          action:'self_change_login_id',
          new_login_id:nextLogin,
          current_password:currentPasswordForUsername
        });
        setUsername(result.login_id||nextLogin);
        setCurrentPasswordForUsername('');
        onProfileUpdate&&onProfileUpdate({...profile,login_id:result.login_id||nextLogin});
        setMessage(`✓ Login ID changed to "${result.login_id||nextLogin}". Use the new Login ID the next time you sign in.`);
      }catch(error){setMessage(error.message||'Unable to change Login ID.')}
      setBusy('');
    }

    async function changePassword(e){
      e.preventDefault();
      if(!currentPassword){setMessage('Enter your current password.');return}
      if(newPassword.length<8){setMessage('New password must contain at least 8 characters.');return}
      if(newPassword!==confirmPassword){setMessage('New password and confirmation do not match.');return}
      if(newPassword===currentPassword){setMessage('Please choose a new password different from the current password.');return}
      setBusy('password');setMessage('');
      try{
        await selfRequest({
          action:'self_change_password',
          current_password:currentPassword,
          new_password:newPassword
        });
        setCurrentPassword('');setNewPassword('');setConfirmPassword('');
        setMessage('✓ Password changed successfully. Your current session remains active.');
      }catch(error){setMessage(error.message||'Unable to change password.')}
      setBusy('');
    }

    const initials=String(formalName(profile)||profile?.full_name||profile?.login_id||'S')
      .split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()||'').join('');

    const readonly=(label,value)=>h('div',{style:{padding:'11px 12px',border:'1px solid #ead4de',borderRadius:'12px',background:'#fffafd'}},
      h('small',{style:{display:'block',color:'#816c76',marginBottom:'3px'}},label),
      h('strong',{style:{color:'#3b2730'}},value||'—')
    );

    return h('div',{className:'my-profile-page'},
      h('style',null,`
        .my-profile-page .profile-hero{
          background:linear-gradient(135deg,#fff8fb 0%,#f7dbe7 52%,#efc4d5 100%);
          border:1px solid #e3b6c8;border-radius:20px;padding:18px 20px;
          box-shadow:0 10px 28px rgba(119,18,65,.09);
          display:flex;align-items:center;gap:16px;flex-wrap:wrap;
        }
        .my-profile-page .profile-avatar{
          width:66px;height:66px;border-radius:50%;
          display:grid;place-items:center;
          background:linear-gradient(145deg,#8e1048,#d1276c);
          color:white;font-size:24px;font-weight:950;
          border:4px solid rgba(255,255,255,.8);
          box-shadow:0 7px 18px rgba(109,15,56,.18);
        }
        .my-profile-page .profile-grid{
          display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;
        }
        .my-profile-page .profile-two{
          display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;
        }
        .my-profile-page .profile-card{
          background:linear-gradient(145deg,#fffafd,#fdf1f6);
          border:1px solid #e8c3d2;border-radius:18px;padding:16px;
          box-shadow:0 6px 18px rgba(108,24,60,.06);
        }
        .my-profile-page .profile-card h3{margin-top:0;color:#6f103d}
        .my-profile-page .security-note{
          padding:9px 11px;border-radius:11px;background:#fff3f7;border:1px solid #efd0dd;
          color:#76505f;font-size:12px;line-height:1.45;
        }
        @media(max-width:700px){
          .my-profile-page .profile-two{grid-template-columns:1fr}
          .my-profile-page .profile-hero{padding:15px}
        }
      `),
      h('div',{className:'profile-hero'},
        h('div',{className:'profile-avatar'},initials||'S'),
        h('div',{style:{flex:'1 1 260px'}},
          h('div',{style:{fontSize:'23px',fontWeight:950,color:'#4b1630'}},formalName(profile)||profile?.full_name||'My Profile'),
          h('div',{style:{marginTop:'4px',color:'#735b66'}},`${profile?.designation||profile?.role||'Staff'} · ${profile?.department||'Samara'}`),
          h('div',{style:{marginTop:'7px',display:'flex',gap:'7px',flexWrap:'wrap'}},
            h('span',{className:'badge'},profile?.employee_id||'Employee'),
            h('span',{className:'badge'},profile?.role||'Staff')
          )
        )
      ),

      message?h('div',{className:`message ${message.startsWith('✓')?'success':'error'}`,style:{marginTop:'14px'}},message):null,

      h(Section,{title:'Employment Profile',subtitle:'Official employment details are maintained by HR and cannot be changed here.'},
        h('div',{className:'profile-grid'},
          readonly('Employee ID',profile?.employee_id),
          readonly('Full Name',formalName(profile)||profile?.full_name),
          readonly('Department',profile?.department),
          readonly('Designation',profile?.designation),
          readonly('ERP Role / Access',profile?.role),
          readonly('Date of Joining',profile?.date_of_joining?formatDateIN(profile.date_of_joining):'—')
        )
      ),

      h('div',{className:'profile-two'},
        h('form',{className:'profile-card',onSubmit:saveContact},
          h('h3',null,'Personal Contact Details'),
          h('p',{className:'small-note'},'You may update your own contact information. Official employment fields remain controlled by HR.'),
          h('div',{className:'field'},h('label',null,'Mobile'),h('input',{value:contact.mobile,onChange:e=>setContact({...contact,mobile:e.target.value}),inputMode:'tel',placeholder:'Mobile number'})),
          h('div',{className:'field'},h('label',null,'Email'),h('input',{type:'email',value:contact.employee_email,onChange:e=>setContact({...contact,employee_email:e.target.value}),placeholder:'Personal / work email'})),
          h('div',{className:'field'},h('label',null,'Address'),h('textarea',{rows:3,value:contact.address,onChange:e=>setContact({...contact,address:e.target.value}),placeholder:'Current contact address'})),
          h('div',{className:'field'},h('label',null,'Emergency / Guardian Contact'),h('input',{value:contact.emergency_contact,onChange:e=>setContact({...contact,emergency_contact:e.target.value}),inputMode:'tel'})),
          h('button',{className:'btn btn-primary full',disabled:busy==='contact'},busy==='contact'?'Saving…':'Save My Details')
        ),

        h('div',{className:'profile-card'},
          h('h3',null,'Login & Security'),
          h('div',{className:'security-note'},'Your Login ID and password are private. Changing them does not alter your Employee ID, designation, department or ERP role.'),

          h('form',{onSubmit:changeUsername,style:{marginTop:'14px'}},
            h('div',{className:'field'},h('label',null,'Login ID / Username'),h('input',{value:username,onChange:e=>setUsername(e.target.value),required:true,autoComplete:'username'})),
            h('div',{className:'field'},h('label',null,'Current Password'),h('input',{type:'password',value:currentPasswordForUsername,onChange:e=>setCurrentPasswordForUsername(e.target.value),required:true,autoComplete:'current-password',placeholder:'Required to change Login ID'})),
            h('button',{className:'btn btn-secondary full',disabled:busy==='username'},busy==='username'?'Changing…':'Change Login ID')
          ),

          h('hr',{style:{border:0,borderTop:'1px solid #ead5df',margin:'18px 0'}}),

          h('form',{onSubmit:changePassword},
            h('div',{className:'field'},h('label',null,'Current Password'),h('input',{type:'password',value:currentPassword,onChange:e=>setCurrentPassword(e.target.value),required:true,autoComplete:'current-password'})),
            h('div',{className:'field'},h('label',null,'New Password'),h('input',{type:'password',value:newPassword,onChange:e=>setNewPassword(e.target.value),minLength:8,required:true,autoComplete:'new-password'})),
            h('div',{className:'field'},h('label',null,'Confirm New Password'),h('input',{type:'password',value:confirmPassword,onChange:e=>setConfirmPassword(e.target.value),minLength:8,required:true,autoComplete:'new-password'})),
            h('button',{className:'btn btn-primary full',disabled:busy==='password'},busy==='password'?'Changing…':'Change Password')
          )
        )
      )
    );
  }

