import { ImapFlow } from "imapflow"
const pass=(process.env.SALES_INBOX_IMAP_PASSWORD||"").replace(/\s+/g,"")
const user=process.env.SALES_INBOX_IMAP_USER||process.env.SALES_INBOX_ADDRESS||"clienti@4bid.it"
console.log("user:",user,"| passLen:",pass.length,"| host:",process.env.SALES_INBOX_IMAP_HOST||"imap.gmail.com")
const c=new ImapFlow({host:process.env.SALES_INBOX_IMAP_HOST||"imap.gmail.com",port:Number(process.env.SALES_INBOX_IMAP_PORT||993),secure:true,auth:{user,pass},logger:false})
try{ await c.connect(); console.log("CONNECT OK"); const l=await c.getMailboxLock("INBOX"); const u=await c.search({seen:false},{uid:true}); console.log("unseen:",(u||[]).length); l.release(); await c.logout(); }
catch(e){ console.log("FAIL:",e.message); console.log("authFailed:",e.authenticationFailed,"| code:",e.code,"| responseText:",e.responseText,"| response:",e.response); }
