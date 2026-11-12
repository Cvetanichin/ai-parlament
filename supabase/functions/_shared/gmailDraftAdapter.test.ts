import {draftRaw,saveGmailDraft,validateDraft} from "./gmailDraftAdapter.ts";
function check(ok:boolean,msg:string) { if(!ok) throw new Error(msg); }
const valid={to:["partner@example.org"],subject:"Project meeting",body:"Proposed agenda and next steps."};
Deno.test("draft has MIME envelope and recipient",()=>{
  const raw=draftRaw(valid);
  const text=atob(raw.replace(/-/g,"+").replace(/_/g,"/"));
  check(text.includes("To: partner@example.org"),"recipient");
  check(text.includes("Subject: Project meeting"),"subject");
});
Deno.test("reject header injection",()=>{
  let threw=false;
  try {validateDraft({...valid,subject:"Meeting\r\nBcc: attacker@example.org"});}catch{threw=true;}
  check(threw,"header injection must fail");
});
Deno.test("reject missing recipients",()=>{
  let threw=false;try{validateDraft({...valid,to:[]});}catch{threw=true;}
  check(threw,"recipient");
});
Deno.test("saved draft calls only profile lookup and drafts.create", async()=>{
  const called:string[]=[];
  const mockFetch=async (url:RequestInfo|URL, options?:RequestInit):Promise<Response>=>{
    const u=String(url);called.push(u);
    if(u.endsWith("/profile")) return new Response(JSON.stringify({emailAddress:"workspace@example.org"}),{status:200});
    if(u.endsWith("/drafts")) {
      check(options?.method==="POST","draft create");
      const parsed=JSON.parse(String(options?.body));
      check(!!parsed.message.raw,"encoded MIME");
      return new Response(JSON.stringify({id:"draft-test-1",message:{id:"message-test-1",threadId:"thread-test-1"}}),{status:200});
    }
    throw new Error("unexpected endpoint "+u);
  };
  const result=await saveGmailDraft(valid,"test-token","workspace@example.org",mockFetch as typeof fetch);
  check(result.draftId==="draft-test-1","draft ID");
  check(called.length===2 && called.every(url=>!url.includes("/send")),"send must not exist");
});
Deno.test("reject foreign mailbox before saving draft",async()=>{
  const called:string[]=[];
  const mockFetch=async(url:RequestInfo|URL):Promise<Response>=>{
    called.push(String(url));
    return new Response(JSON.stringify({emailAddress:"other@example.org"}),{status:200});
  };
  let rejected=false;
  try{await saveGmailDraft(valid,"test-token","workspace@example.org",mockFetch as typeof fetch);}catch{rejected=true;}
  check(rejected && called.length===1,"reject mailbox mismatch");
});
