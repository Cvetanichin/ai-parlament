// POST /workspace-gmail-draft
// Uses Parliament Core authorisation, projects and workflow instances.
// A private draft-only executor: NO email send endpoint or automatic review approval.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { withCors } from "../_shared/cors.ts";
import { draftQueueDigest, isPrivateMailboxOwner, draftRaw, gmailAccessToken, saveGmailDraft, validateDraft,
  type GmailDraftInput } from "../_shared/gmailDraftAdapter.ts";

interface ProposeBody {
  operation: "propose";
  projectId: string;
  workflowInstanceId?: string;
  workControlTaskId?: string;
  idempotencyKey: string;
  sourceRefs: string[];
  draft: GmailDraftInput;
}
interface ExecuteBody { operation:"execute"; projectId:string; actionId:string; }
type RequestBody=ProposeBody|ExecuteBody;

function json(body:unknown,status=200):Response {
  return new Response(JSON.stringify(body), {status,headers:{"Content-Type":"application/json"}});
}
function bad(message:string,status=400):Response { return json({error:{code:message}},status); }
function validUuid(value:string):boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
Deno.serve(withCors(async (req:Request) => {
  if(req.method!=="POST") return bad("method_not_allowed",405);
  try {
    const body = await req.json() as RequestBody;
    if (!body?.projectId || !validUuid(body.projectId)) return bad("invalid_project_id");
    const admin=supabaseAdmin();
    const caller=await resolveCaller(req,admin,body.projectId);
    if (caller.userId==="system") return bad("human_user_session_required",403);

    if (!isPrivateMailboxOwner(caller.userId, Deno.env.get("GMAIL_OWNER_USER_ID"))) return bad("mailbox_owner_required",403);

    if(body.operation==="propose") {
      const { draft, sourceRefs, idempotencyKey, workflowInstanceId, workControlTaskId }=body;
      if(typeof idempotencyKey!=="string" || idempotencyKey.length<8 || idempotencyKey.length>160) return bad("invalid_idempotency_key");
      if(!Array.isArray(sourceRefs) || sourceRefs.length<1 || sourceRefs.length>25 ||
        !sourceRefs.every(s=>typeof s==="string" && s.length>0 && s.length<=1000)) return bad("missing_source_refs");
      try { validateDraft(draft); } catch { return bad("invalid_draft"); }
      if(workflowInstanceId && !validUuid(workflowInstanceId)) return bad("invalid_workflow_instance");
      if(workflowInstanceId) {
        const {data:workflow,error}=await admin.from("workflow_instances")
          .select("id,organisation_id").eq("id",workflowInstanceId)
          .eq("organisation_id",caller.organisationId).maybeSingle();
        if(error) throw error;
        if(!workflow) return bad("workflow_not_found",404);
      }
      // Only validated structure, not semantic accuracy. Every final draft still needs human review.
      const payload={draft,sourceRefs,projectId:body.projectId,workflowInstanceId:workflowInstanceId??null};
      const fingerprint=await draftQueueDigest(payload);
      const record={
        owner_user_id:caller.userId,organisation_id:caller.organisationId,
        project_id:body.projectId,workflow_instance_id:workflowInstanceId??null,
        work_control_task_id:workControlTaskId??null, provider:"gmail",
        action_kind:"gmail.draft",idempotency_key:idempotencyKey,
        draft_payload:draft,payload_digest:fingerprint,source_refs:sourceRefs,
        validation_status:"passed",review_status:"not_reviewed",status:"validated"
      };
      const {data:existing,error:existingErr}=await admin.from("workspace_action_queue")
        .select("id,payload_digest,status,provider_draft_id").eq("owner_user_id",caller.userId)
        .eq("idempotency_key",idempotencyKey).maybeSingle();
      if(existingErr) throw existingErr;
      if(existing) {
        const expected = existing.payload_digest.startsWith("sha256:") ? await draftQueueDigest(payload, true) : fingerprint;
        if(existing.payload_digest!==expected) return bad("idempotency_conflict",409);
        return json({actionId:existing.id,status:existing.status,draftId:existing.provider_draft_id,reused:true});
      }
      const {data:created,error:createErr}=await admin.from("workspace_action_queue")
        .insert(record).select("id,status").single();
      if(createErr) {
        if(createErr.code==="23505") return bad("idempotency_collision_retry_lookup",409);
        throw createErr;
      }
      const {error:evtErr}=await admin.from("workspace_action_events").insert({
        action_id:created.id,event:"draft_proposed",actor_user_id:caller.userId,
        metadata:{payload_digest:fingerprint,source_count:sourceRefs.length}
      });
      if(evtErr) throw evtErr;
      return json({actionId:created.id,status:created.status,review:"not_reviewed"},201);
    }

    if(body.operation==="execute") {
      if(!body.actionId || !validUuid(body.actionId)) return bad("invalid_action_id");
      const {data:action,error:actionErr}=await admin.from("workspace_action_queue")
        .select("*").eq("id",body.actionId).eq("owner_user_id",caller.userId)
        .eq("project_id",body.projectId).eq("organisation_id",caller.organisationId).maybeSingle();
      if(actionErr) throw actionErr;
      if(!action) return bad("not_found",404);
      if(action.provider!=="gmail" || action.action_kind!=="gmail.draft") return bad("operation_disabled",403);
      if(action.status==="succeeded") return json({actionId:action.id,status:"succeeded",draftId:action.provider_draft_id,reused:true});
      if(action.status!=="validated" || action.validation_status!=="passed") return bad("not_validated_or_not_ready",409);
      if(!Array.isArray(action.source_refs) || action.source_refs.length===0) return bad("source_manifest_missing",409);
      const draft=action.draft_payload as GmailDraftInput;
      try { draftRaw(draft); } catch { return bad("invalid_saved_draft",409); }
      const fresh=await draftQueueDigest({draft,sourceRefs:action.source_refs,projectId:action.project_id,workflowInstanceId:action.workflow_instance_id??null}, action.payload_digest.startsWith("sha256:"));
      if(fresh!==action.payload_digest) return bad("payload_changed",409);
      // Fail closed BEFORE claiming if server secrets are absent.
      const clientId=Deno.env.get("GMAIL_CLIENT_ID")??"";
      const clientSecret=Deno.env.get("GMAIL_CLIENT_SECRET")??"";
      const refreshToken=Deno.env.get("GMAIL_REFRESH_TOKEN")??"";
      const allowedEmail=Deno.env.get("GMAIL_ALLOWED_EMAIL")??"";
      if(!clientId || !clientSecret || !refreshToken || !allowedEmail) return bad("gmail_not_configured",503);
      const {data:claimed,error:claimErr}=await admin.from("workspace_action_queue")
        .update({status:"executing",attempts:action.attempts+1,updated_at:new Date().toISOString()})
        .eq("id",action.id).eq("status","validated").eq("payload_digest",fresh)
        .select("id").maybeSingle();
      if(claimErr) throw claimErr;
      if(!claimed) return bad("action_already_claimed",409);
      try {
        const accessToken=await gmailAccessToken({clientId,clientSecret,refreshToken,allowedEmail});
        const draftResult=await saveGmailDraft(draft,accessToken,allowedEmail);
        const {error:saveErr}=await admin.from("workspace_action_queue").update({
          status:"succeeded",provider_draft_id:draftResult.draftId,
          provider_thread_id:draftResult.threadId,review_status:"ready_for_review",
          provider_result:{message_id:draftResult.messageId},updated_at:new Date().toISOString()
        }).eq("id",action.id).eq("status","executing");
        if(saveErr) throw saveErr;
        const {error:evtErr}=await admin.from("workspace_action_events").insert({
          action_id:action.id,event:"gmail_draft_saved",actor_user_id:caller.userId,
          metadata:{draft_id:draftResult.draftId,thread_id:draftResult.threadId}
        });
        if(evtErr) throw evtErr;
        return json({actionId:action.id,status:"succeeded",draftId:draftResult.draftId,
          threadId:draftResult.threadId,review:"ready_for_review"});
      } catch(err) {
        // External side effect may have happened. Do not blind-retry or mark safely failed.
        await admin.from("workspace_action_queue").update({
          last_error:(err as Error).message, updated_at:new Date().toISOString()
        }).eq("id",action.id).eq("status","executing");
        return bad("draft_outcome_requires_reconciliation",502);
      }
    }
    return bad("unsupported_operation",422);
  } catch(err) {
    const message=(err as Error).message;
    return bad(message.startsWith("unauthorized")?"unauthorized":
      message.startsWith("forbidden")?"forbidden":"internal_error",
      message.startsWith("unauthorized")?401:message.startsWith("forbidden")?403:500);
  }
}));
