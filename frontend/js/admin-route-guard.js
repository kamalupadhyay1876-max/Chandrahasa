/* Hide admin-only operational panels until the server confirms an admin session. */
'use strict';
(async function adminRouteGuard(){
  const main=document.querySelector('main.ops');
  const gate=document.getElementById('marketplaceAdminGate');
  if(!main)return;
  try{
    const me=await CH.api('/api/auth/me');
    if(!me.user||me.user.role!=='admin')throw new Error('Admin sign-in required.');
    main.hidden=false;
    if(gate)gate.hidden=true;
  }catch{
    main.hidden=true;
    if(gate)gate.hidden=false;
  }
})();
