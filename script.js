const toggle=document.querySelector('.nav-toggle'),nav=document.querySelector('#nav');
toggle?.addEventListener('click',()=>{const open=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',open)});
nav?.addEventListener('click',()=>{nav.classList.remove('open');toggle?.setAttribute('aria-expanded','false')});
document.querySelector('#year').textContent=new Date().getFullYear();
const now=new Date(),hour=+new Intl.DateTimeFormat('en-GB',{hour:'numeric',hour12:false,timeZone:'Asia/Kolkata'}).format(now),weekday=new Intl.DateTimeFormat('en-GB',{weekday:'short',timeZone:'Asia/Kolkata'}).format(now),weekend=/Sat|Sun/.test(weekday),open=hour>=8&&hour<(weekend?22:21);
document.querySelector('#open-status').textContent=open?'Open now · Drop in':'Closed now · Opens at 8 AM';