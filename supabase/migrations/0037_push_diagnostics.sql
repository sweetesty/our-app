-- ============================================================================
-- 0037_push_diagnostics.sql — why a notification did not land
-- ============================================================================
-- A push crosses four things that can each fail silently: the config row, the
-- HTTP call out of Postgres, the Edge Function, and Firebase. dispatch_push
-- deliberately swallows every error — a failed notification must never roll
-- back the message that triggered it — so a push that never arrives leaves no
-- trace anywhere the app can see.
--
-- These two put the trace on screen. Nothing here can send anything to anyone
-- but yourself, and nothing here reveals a token.

/**
 * The state of the whole chain, from this account's point of view.
 *
 * The last few responses come from pg_net's own log. They are the Edge
 * Function's replies — {"sent":1} or {"sent":0,"reason":"no registered
 * devices"} — which is exactly the sentence needed and nothing more.
 */
create or replace function public.push_diagnostics()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, net, cron
as $$
declare
  cfg record;
  result jsonb;
begin
  select enabled, (function_url is not null) as has_url
  into cfg
  from private.push_config
  limit 1;

  result := jsonb_build_object(
    'configured', coalesce(cfg.enabled and cfg.has_url, false),
    'my_devices', (
      select count(*) from public.device_tokens where user_id = auth.uid()
    ),
    'their_devices', (
      select count(*) from public.device_tokens where user_id = public.partner_id()
    )
  );

  -- A vault letter is the one notification nothing writes a row for: it
  -- becomes openable because time passed. An hourly job announces those, so
  -- if the job is not scheduled, no letter is ever announced no matter how
  -- healthy the rest of the chain is.
  begin
    result := result || jsonb_build_object('jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', j.jobname,
        'schedule', j.schedule,
        'active', j.active,
        'last_run', (
          select d.end_time from cron.job_run_details d
          where d.jobid = j.jobid order by d.end_time desc limit 1
        ),
        'last_status', (
          select d.status from cron.job_run_details d
          where d.jobid = j.jobid order by d.end_time desc limit 1
        )
      ))
      from cron.job j
    ), '[]'::jsonb));
  exception
    when others then
      result := result || jsonb_build_object('jobs', null);
  end;

  -- pg_net keeps responses for a short while and then sweeps them. An empty
  -- list here does not prove nothing was sent — but a list of 500s does prove
  -- something is wrong.
  begin
    result := result || jsonb_build_object('recent', coalesce((
      select jsonb_agg(row_to_json(r) order by r.created desc)
      from (
        select
          status_code,
          left(coalesce(content, error_msg, ''), 200) as reply,
          created
        from net._http_response
        order by created desc
        limit 5
      ) r
    ), '[]'::jsonb));
  exception
    when others then
      -- pg_net not installed, or its log is not readable on this plan.
      result := result || jsonb_build_object('recent', null);
  end;

  return result;
end;
$$;

grant execute on function public.push_diagnostics() to authenticated;

/**
 * A notification to your own phone.
 *
 * Sent as though it came from your partner, because the Edge Function's whole
 * job is to notify everyone in the couple *except* the sender — addressing it
 * from yourself would correctly deliver it to nobody.
 */
create or replace function public.send_test_push()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  them uuid := public.partner_id();
begin
  if cid is null or them is null then
    raise exception 'You are not paired yet.';
  end if;

  perform public.dispatch_push(jsonb_build_object(
    'type', 'test',
    'couple_id', cid,
    'sender_id', them,
    'sender_name', 'Our Little World'
  ));
end;
$$;

grant execute on function public.send_test_push() to authenticated;
